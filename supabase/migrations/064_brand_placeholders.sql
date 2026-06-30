-- =============================================================================
-- G-DIMENSION — Migration 064: fill in missing brand-field placeholders
-- =============================================================================
-- 23 part types had a NULL placeholder on their 'brand' spec_template, so the
-- Add/Edit mod Brand field fell back to the generic "e.g. HKS" for them. This
-- gives each a per-part-type brand example (comma-list style, matching the ones
-- that already had hints like Front Bumper's "Varis, Voltex, APR..."). Brand
-- placeholders are surfaced via brandPlaceholder() in src/lib/tuningExamples.ts.
-- Idempotent — sets values by part_type_id; safe to re-run.
-- =============================================================================

-- Exterior
update public.spec_templates
set placeholder = 'URAS, D-Max, BN Sports, Origin Lab'
where part_type_id = 72 and spec_key = 'brand';

update public.spec_templates
set placeholder = 'Bomex, Vertex, Rocket Bunny, BN Sports'
where part_type_id = 172 and spec_key = 'brand';

update public.spec_templates
set placeholder = 'Spoon, Craft Square, Ganador'
where part_type_id = 76 and spec_key = 'brand';

update public.spec_templates
set placeholder = 'Voltex, APR, Varis'
where part_type_id = 164 and spec_key = 'brand';

-- Engine
update public.spec_templates
set placeholder = 'HKS, Skunk2, GReddy, BBK'
where part_type_id = 22 and spec_key = 'brand';

-- Exhaust
update public.spec_templates
set placeholder = 'Invidia, Tomei, Berk, HKS'
where part_type_id = 43 and spec_key = 'brand';

update public.spec_templates
set placeholder = 'HKS, Tomei, Vibrant'
where part_type_id = 45 and spec_key = 'brand';

-- Drivetrain
update public.spec_templates
set placeholder = 'Cusco, Kaaz, OS Giken, Tomei'
where part_type_id = 48 and spec_key = 'brand';

update public.spec_templates
set placeholder = 'OEM, Driveshaft Shop, SuperPro'
where part_type_id = 118 and spec_key = 'brand';

-- Brakes
update public.spec_templates
set placeholder = 'OEM, Wilwood, Tilton'
where part_type_id = 131 and spec_key = 'brand';

update public.spec_templates
set placeholder = 'GReddy, Cusco, Verus Engineering'
where part_type_id = 134 and spec_key = 'brand';

-- Cooling
update public.spec_templates
set placeholder = 'Setrab, Mishimoto, Earl''s'
where part_type_id = 145 and spec_key = 'brand';

update public.spec_templates
set placeholder = 'CSF, Mishimoto, AWE'
where part_type_id = 148 and spec_key = 'brand';

update public.spec_templates
set placeholder = 'Verus Engineering, GReddy, Mishimoto'
where part_type_id = 149 and spec_key = 'brand';

-- Interior
update public.spec_templates
set placeholder = 'Real Carbon, OEM, Mugen'
where part_type_id = 86 and spec_key = 'brand';

update public.spec_templates
set placeholder = 'Bride, Spoon, OEM'
where part_type_id = 87 and spec_key = 'brand';

update public.spec_templates
set placeholder = 'Alcantara, Suede, OEM'
where part_type_id = 168 and spec_key = 'brand';

-- Lighting
update public.spec_templates
set placeholder = 'Valenti, Spec-D, Morimoto, Depo'
where part_type_id = 95 and spec_key = 'brand';

update public.spec_templates
set placeholder = 'Diode Dynamics, Morimoto, OEM'
where part_type_id = 97 and spec_key = 'brand';

update public.spec_templates
set placeholder = 'OEM, Spec-D, Depo'
where part_type_id = 159 and spec_key = 'brand';

-- Safety
update public.spec_templates
set placeholder = 'Schroth, RJS, G-Force'
where part_type_id = 69 and spec_key = 'brand';

-- Suspension
update public.spec_templates
set placeholder = 'OEM, Wisefab, Parts Shop Max'
where part_type_id = 126 and spec_key = 'brand';

-- Other (catch-all — neutral hint)
update public.spec_templates
set placeholder = 'Brand name'
where part_type_id = 105 and spec_key = 'brand';

-- Verify (expect 0 rows: every Exterior+ brand spec now has a hint)
select pt.category, pt.name
from public.spec_templates st
join public.part_types pt on pt.id = st.part_type_id
where st.spec_key = 'brand' and (st.placeholder is null or st.placeholder = '')
order by pt.category, pt.name;
