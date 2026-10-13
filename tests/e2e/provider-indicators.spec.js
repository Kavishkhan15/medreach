import { test, expect } from '@playwright/test';
const id = '111111111111111111111111';
const hospital = { _id: id, slug: 'indicator-hospital', name: 'Indicator Hospital', city: 'Mumbai', locality: 'Bandra', hospitalType: 'Private', verificationStatus: 'verified', approvalStatus: 'approved', lastUpdated: '2026-01-01T00:00:00Z', sourceName: 'Scraping source sentinel', sourceUrl: 'https://example.com/source', phone: '+919876543210', website: 'https://example.com', location: { type: 'Point', coordinates: [72.83,19.06] }, specialties: ['Cardiology'], facilities: [{ facility: 'ICU', status: 'available', capability: 'yes', observedAt: '2026-01-01T00:00:00Z', capabilityProvenance: { verificationStatus: 'verified', confidence: 'HIGH', source: { name: 'Scraping source sentinel' } } }] };
const resources = { 'blood-banks': { ...hospital, _id: '222222222222222222222222', name: 'Indicator Blood Bank', kind: 'blood_bank', verificationStatus: 'unverified', listedBloodGroups: ['O+'] }, diagnostics: { ...hospital, _id: '333333333333333333333333', name: 'Indicator Diagnostics', kind: 'diagnostic', verificationStatus: 'unverified', services: ['MRI'] }, ambulances: { ...hospital, _id: '444444444444444444444444', name: 'Indicator Ambulance', kind: 'ambulance', verificationStatus: 'unverified', providerType: 'Ambulance' } };
const json = (route, data) => route.fulfill({ json: data });
test.beforeEach(async ({ page }) => {
  page.__runtimeErrors = []; page.on('pageerror', e => page.__runtimeErrors.push(e.message));
  await page.route('**/api/**', route => {
    const p = new URL(route.request().url()).pathname;
    if(p === '/api/auth/me') return json(route,{user:{_id:'555555555555555555555555',name:'Test account',role:'system_admin',region:'Mumbai',email:'admin@example.test'}});
    if(p === '/api/admin/overview') return json(route,{hospitals:1,verified:1,verificationQueue:0});
    if(p === '/api/organizations/careers') return json(route,{data:[{...hospital,type:'hospital',kind:'hospital',organizationType:'hospital',jobs:[]}]});
    if(p === '/api/admin/hospitals' || p === '/api/hospitals') return json(route,{data:[hospital],total:1,page:1,perPage:50});
    if(p === '/api/hospitals/indicator-hospital') return json(route,{hospital});
    if(p === '/api/hospitals/indicator-hospital/enriched') return json(route,{enriched:hospital});
    for(const [kind,row] of Object.entries(resources)) if(p === `/api/${kind}`) return json(route,{data:[row]});
    return json(route,{data:[]});
  });
});
test.afterEach(async ({page})=>expect(page.__runtimeErrors).toEqual([]));

test('public directories retain providers and care actions without scraping verification indicators', async ({page}, testInfo) => {
  for(const [path,name] of [['/','Indicator Hospital'],['/hospitals','Indicator Hospital'],['/hospitals/indicator-hospital','Indicator Hospital'],['/blood-banks','Indicator Blood Bank'],['/diagnostics','Indicator Diagnostics'],['/ambulances','Indicator Ambulance'],['/map','Indicator Hospital'],['/careers','Indicator Hospital']]) {
    await page.goto(path); const main=page.locator('main').first();
    await expect(main.getByText(name,{exact:true}).first()).toBeVisible();
    await expect(main).not.toContainText(/verified|unverified|verification|freshness|last scraped|high confidence|Scraping source sentinel|Source:/i);
    await expect(main.locator('option').filter({hasText:'Recently updated'})).toHaveCount(0);
    if(path === '/') {
      const card=main.locator('article[data-provider-id]').filter({hasText:hospital.name});
      await card.getByRole('button').first().click();
      for(const action of ['Call','Directions','Details','Bed Request']) await expect(card.getByRole('link',{name:action,exact:true})).toBeVisible();
      await expect(card).not.toContainText(/verified|verification|freshness|Scraping source sentinel|Source:/i);
    }
    if(path === '/blood-banks') await expect(main.getByRole('button',{name:'Request / Donate Blood'})).toBeVisible();
    if(path === '/ambulances') await expect(main.getByRole('button',{name:'Book Ambulance'})).toBeVisible();
    if(path === '/hospitals/indicator-hospital') {
      await expect(main.getByRole('link',{name:/Request.*Bed|Request Bed/})).toBeVisible();
      // Bootstrap preserves its information/actions layout; the other variants expose the availability table.
      if(testInfo.project.name !== 'bootstrap') await expect(main.getByRole('columnheader',{name:'Observed',exact:true})).toBeVisible();
    }
  }
});

test('System Admin hospital listings and overview hide scraping indicators while Provider Approvals still approves and rejects', async ({page}) => {
  await page.goto('/admin/hospitals');
  await expect(page.getByRole('row').filter({hasText:hospital.name})).toBeVisible();
  await expect(page.getByRole('columnheader',{name:/Verification|Freshness/})).toHaveCount(0);
  await page.goto('/admin');
  await expect(page.getByRole('region',{name:'Hospital totals'})).toContainText('Hospitals tracked');
  await expect(page.locator('main').first()).not.toContainText(/verified hospitals|verification queue|Data freshness/);
  let applications = ['approve','reject'].map((decision,i)=>({_id:`66666666666666666666666${i+1}`,name:`Application ${decision}`,kind:'hospital',status:'pending',address:'Test street',contactEmail:'controlled@example.com'}));
  await page.route('**/api/admin/provider-approvals',r=>json(r,{data:applications}));
  await page.route('**/api/admin/provider-approvals/*/review',r=>{const body=r.request().postDataJSON();expect(['approve','reject']).toContain(body.decision);const target=r.request().url().split('/').at(-2);applications=applications.map(a=>a._id===target?{...a,status:body.decision==='approve'?'approved':'rejected'}:a);return json(r,{ok:true});});
  await page.goto('/admin/provider-approvals');
  await page.locator('article').filter({hasText:'Application approve'}).getByRole('button',{name:'Approve and provision'}).click();
  await expect(page.locator('article').filter({hasText:'Application approve'})).toContainText('approved');
  await page.locator('article').filter({hasText:'Application reject'}).getByRole('button',{name:'Reject',exact:true}).click();
  await expect(page.locator('article').filter({hasText:'Application reject'})).toContainText('rejected');
});

test('assistant provider results retain contact and bed actions without scraping verification badges', async ({page}) => {
  await page.route('**/api/assistant/message',r=>json(r,{reply:'Here is a listed provider.',intent:'hospital',hospitals:[{...hospital,id,coordinates:hospital.location.coordinates,facilityDetail:{facility:'ICU',status:'available',retrievedAtRelative:'4 minutes ago'}}]}));
  await page.goto('/hospitals');
  await page.getByRole('button').filter({hasText:'SOS'}).click();
  await page.getByRole('dialog',{name:'Emergency help'}).getByRole('button',{name:/MedReach Healthcare Assistant/}).click();
  const panel=page.getByRole('dialog',{name:'MedReach Healthcare Assistant',exact:true});
  await panel.getByRole('textbox',{name:'Message MedReach Healthcare Assistant'}).fill('Find a hospital');
  await panel.getByRole('button',{name:'Send',exact:true}).click();
  const result=panel.getByRole('region',{name:'Hospital matches',exact:true});
  await expect(result.getByText(hospital.name,{exact:true})).toBeVisible();
  await expect(result).not.toContainText(/verified|verification|Scraped|Updated/);
  await expect(result).toContainText('Availability observed 4 minutes ago');
  await expect(result.getByRole('link',{name:'Call',exact:true})).toBeVisible();
  await expect(result.getByRole('link',{name:'Bed Request',exact:true})).toBeVisible();
});
