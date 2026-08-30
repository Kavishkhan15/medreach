# Image Analysis — MedReach Emergency Hospital

## Layer 1 — Identification & classification

The subject is a stylized architectural healthcare facility / emergency hospital building.

Primary type: emergency hospital / healthcare facility.
Primary domain: object.
Confidence: 0.98.

Visible inventory includes:
- main multi-level hospital mass
- projecting emergency/front wing
- recessed main entrance
- repeated window bands
- roof/upper-level structures
- ambulance-access forecourt
- rooftop/upper emergency-access structure
- surrounding base/ground elements
- vegetation and small environmental elements

Inference:
The building is designed to visually communicate an emergency medical facility rather than a generic office or residential building.

## Layer 2 — Overall form & silhouette

The building is composed primarily of geometric architectural volumes:
- cuboids / extruded profiles for the main building masses
- thinner cuboid bands for structural framing
- recessed rectangular openings for entrances
- repeated rectangular window modules
- flat or shallow roof volumes

Overall shape language is geometric and asymmetric.

The front-facing hospital mass dominates the image.
A secondary wing projects relative to the primary volume.
The visible footprint is wider than it is deep.
The building has multiple stacked levels.

The image is a perspective three-quarter view, so the rear elevation and portions of the opposite side are hidden.

## Layer 3 — Macro → meso → micro decomposition

### Macro components

1. Main hospital building
2. Emergency/front wing
3. Entrance/forecourt structure
4. Upper/roof structures
5. Ground/base platform

### Meso components

- repeated window bands
- vertical structural frames
- horizontal facade bands
- recessed emergency entrance
- projecting canopy/entrance volume
- roof equipment/architectural blocks
- ambulance access area
- ground-level facade sections

### Micro feature groups

- window divisions
- door/opening frames
- facade edge strips
- emergency signage/details
- small roof/structural accents
- vegetation clusters
- pavement/ground markings

## Layer 4 — Spatial relationships / scene graph

- Main hospital building is the parent architectural mass.
- Emergency/front wing is attached-to the main hospital mass.
- Window bands are inset-in / flush-with facade surfaces.
- Structural facade frames are attached-to the exterior facade.
- Main entrance is recessed-into the front facade.
- Entrance canopy/foreground structure is attached-to the entrance area.
- Upper roof structures are above the main hospital mass.
- Ground/base platform is below the hospital.
- Ambulance-access area is in-front-of / adjacent-to the emergency entrance.

Attachment/contact assumptions:
- facade sections use flush-with / attached-to relationships
- entrance volumes use overlap / embed with the main facade
- windows are inset into facade openings

## Layer 5 — Materials & surface (PBR)

Main facade surfaces:
- opaque architectural dielectric
- light neutral albedo
- matte-to-satin finish
- roughness approximately high to medium-high

Dark structural framing:
- opaque dielectric
- dark blue/navy albedo
- satin finish
- medium roughness

Glass/window surfaces:
- transparent or semi-transparent dielectric
- dark blue/gray appearance
- lower roughness than facade
- reflective response

Ground/pavement:
- opaque dielectric
- neutral gray albedo
- matte finish
- high roughness

Vegetation:
- organic opaque materials
- green albedo
- matte finish

Important limitation:
Observed highlights/reflections in the reference should not automatically be treated as albedo.

## Layer 6 — Color & finish

Primary facade color:
- light neutral / off-white
- high value
- low-to-medium saturation

Secondary structural color:
- dark blue/navy
- low value
- relatively low saturation

Accent:
- restrained red emergency accent
- medium-to-high saturation
- medium value

Windows:
- blue-gray / dark cool tone
- lower value than facade

Finish:
- facade approximately matte/satin
- structural elements approximately satin
- glazing approximately gloss/reflective
- pavement approximately matte

## Layer 7 — Identity-defining features

Identity-defining features include:

1. Multi-volume modern emergency-hospital silhouette.
2. Strong dark navy structural framing against the light facade.
3. Clearly recessed/protruding emergency entrance composition.
4. Repeated horizontal window bands.
5. Red emergency/medical accent.
6. Ambulance-oriented front forecourt.
7. Distinct rooftop/upper-level architectural structure.

These should be represented as actual model components or local material/detail features rather than prose only.

## Layer 8 — Uncertainty & single-image limits

Hidden or uncertain:
- rear facade
- opposite side facade
- exact building depth
- unseen roof surfaces
- interior geometry
- exact window depth where occluded
- exact ambulance/forecourt geometry outside the visible region
- exact dimensions of rooftop structures

These areas are:
- hidden
- occluded
- uncertain
- needs another view

The additional MedReach reference images should be used later to resolve geometry and material uncertainty rather than inventing hidden geometry.

## Visual Delta Targets

The reconstruction should preserve:
- overall asymmetric hospital silhouette
- relative proportions of primary and secondary building masses
- placement and size of emergency entrance
- repeated window distribution
- dark structural framing
- light facade / dark-frame contrast
- emergency red accent placement
- visible ambulance-access composition
