import { Router } from 'express';
import { body, param } from 'express-validator';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  listOrganizationsForCareers,
  applyToOrganization,
  organizationApplications,
  reviewOrganizationApplication,
} from '../controllers/organizationCareersController.js';
import { applicationValidators } from '../validation/healthcare.js';
import { captureIdempotencyKey } from '../middleware/idempotency.js';

export const organizationCareersRouter = Router();

// Public: list all organizations for careers page
organizationCareersRouter.get('/careers', listOrganizationsForCareers);

// Auth required: apply to an organization
organizationCareersRouter.post(
  '/:id/apply',
  requireAuth,
  captureIdempotencyKey('organization-application'),
  param('id').isMongoId(),
  body('organizationType').isIn(['hospital', 'blood_bank', 'diagnostic', 'ambulance']),
  body('roleInterested').trim().isLength({ min: 2, max: 120 }),
  ...applicationValidators(body),
  body().custom((_value, { req }) => {
    const text = (req.body.sop || req.body.statement || '').trim();
    if (!text || text.length < 10 || text.length > 4000) {
      throw new Error('Statement of Purpose is required (10-4000 characters)');
    }
    return true;
  }),
  validate,
  applyToOrganization
);

// Admin: view applications for an organization
organizationCareersRouter.get(
  '/:id/applications',
  requireAuth,
  requireRole('provider_admin', 'hospital_admin', 'system_admin'),
  param('id').isMongoId(),
  validate,
  organizationApplications
);

// Admin: review an application
export const orgApplicationsRouter = Router();
orgApplicationsRouter.patch(
  '/:id',
  requireAuth,
  param('id').isMongoId(),
  body('status').isIn(['under_review', 'shortlisted', 'rejected']),
  validate,
  reviewOrganizationApplication
);
