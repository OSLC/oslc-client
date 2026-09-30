/** Domain URIs used as the `owner` of a {@link LINK_PROFILE} row. */
export const DOMAIN = {
  RM: 'http://open-services.net/ns/rm#',
  QM: 'http://open-services.net/ns/qm#',
  CM: 'http://open-services.net/ns/cm#',
  AM: 'http://open-services.net/ns/am#'
};

const _RM = 'http://open-services.net/ns/rm#';
const _QM = 'http://open-services.net/ns/qm#';
const _CM = 'http://open-services.net/ns/cm#';
const _AM = 'http://jazz.net/ns/dm/linktypes#';

/**
 * One row per link predicate: who OWNS it, and how its INCOMING direction reads.
 *
 * Both facts come from the "Link Ownership" table of the OSLC Linking Profiles note
 * (oslc-specs/notes/linking-profiles/link-profiles.md), and both answer the same question from
 * opposite ends — *this link is stored over there, so here it is incoming, and here is what to
 * call it.* Keeping them in one table is what stops a predicate being filtered as foreign while
 * no label exists for the direction that replaces it.
 *
 *   owner        the domain whose resource stores the link. A provider may DECLARE a predicate
 *                it does not own: DOORS Next carries the jazz_am types in its own vocabulary,
 *                left over from the Design Manager era before configuration management, and
 *                offers no discoverable way to say they became incoming once a project area is
 *                config enabled. A client must filter those out of its outgoing drop targets or
 *                a link dropped there is written on the wrong resource.
 *
 *   inverseLabel how the incoming direction reads, for predicates whose provider cannot say.
 *                Present only where it is needed. A server that declares
 *                oslc:inversePropertyLabel is DISCOVERED and overrides this -- which is how the
 *                genOSLC servers formalize the same table in their shapes. This is the fallback
 *                for ELM, nothing more.
 *
 * Rows without an inverseLabel are owned all the same; they simply have a secondary predicate of
 * their own (oslc_rm:implementedBy for oslc_cm:implementsRequirement, and so on) that a client
 * already labels from the predicate itself.
 */
export const LINK_PROFILE = new Map([
  [`${_RM}constraints`, { owner: DOMAIN.RM }],
  [`${_RM}decomposes`, { owner: DOMAIN.RM }],
  [`${_RM}elaborates`, { owner: DOMAIN.RM }],
  [`${_RM}satisfies`, { owner: DOMAIN.RM }],
  [`${_RM}specifies`, { owner: DOMAIN.RM }],
  [`${_RM}uses`, { owner: DOMAIN.RM }],

  [`${_QM}validatesRequirement`, { owner: DOMAIN.QM }],
  [`${_QM}validatesRequirementCollection`, { owner: DOMAIN.QM }],

  [`${_CM}implementsRequirement`, { owner: DOMAIN.CM }],
  [`${_CM}tracksRequirement`, { owner: DOMAIN.CM }],
  [`${_CM}affectsRequirement`, { owner: DOMAIN.CM }],
  [`${_CM}testedByTestCase`, { owner: DOMAIN.CM }],
  [`${_CM}relatedTestScript`, { owner: DOMAIN.CM }],
  [`${_CM}relatedTestCase`, { owner: DOMAIN.CM }],
  [`${_CM}relatedTestPlan`, { owner: DOMAIN.CM }],
  [`${_CM}relatedTestExecutionRecord`, { owner: DOMAIN.CM }],
  [`${_CM}blocksTestExecutionRecord`, { owner: DOMAIN.CM }],
  [`${_CM}affectsTestResult`, { owner: DOMAIN.CM }],
  [`${_CM}affectedByDefect`, { owner: DOMAIN.CM }],
  [`${_CM}tracksChangeSet`, { owner: DOMAIN.CM }],
  [`${_CM}relatedChangeRequest`, { owner: DOMAIN.CM }],

  // EWM -> any AM resource: the only link type EWM offers to an architecture resource, and OSLC
  // AM declares no properties at all, so there is no AM term for the reverse and none is being
  // invented. A label, not a predicate.
  [`${_CM}relatedArchitectureElement`, { owner: DOMAIN.CM, inverseLabel: 'Related Change Request' }],

  // The AM rows. Every one has a secondary predicate of -unspecified- in the table, so both
  // sides carry the SAME URI and only `owner` separates them -- which is exactly why a label is
  // required here and not for the rows above. Wording follows DOORS Next's own link-type picker:
  // Traced By, Satisfied By and Derives Architecture Element are verified there; the other three
  // are written to match and should be corrected if DOORS Next words them differently.
  [`${_AM}trace`, { owner: DOMAIN.AM, inverseLabel: 'Traced By Architecture Element' }],
  [`${_AM}satisfy`, { owner: DOMAIN.AM, inverseLabel: 'Satisfied By Architecture Element' }],
  [`${_AM}derives`, { owner: DOMAIN.AM, inverseLabel: 'Derives Architecture Element' }],
  [`${_AM}refine`, { owner: DOMAIN.AM, inverseLabel: 'Refined By Architecture Element' }],
  [`${_AM}elaborates`, { owner: DOMAIN.AM, inverseLabel: 'Elaborated By Architecture Element' }],
  [`${_AM}external`, { owner: DOMAIN.AM, inverseLabel: 'External Link From Architecture Element' }]
]);

/** Predicate -> owning domain, derived from {@link LINK_PROFILE}. */
export const LINK_OWNER_DOMAIN = new Map(
  [...LINK_PROFILE].map(([predicate, row]) => [predicate, row.owner])
);

/**
 * Predicate -> incoming label, for the predicates whose provider cannot declare one. Derived
 * from {@link LINK_PROFILE}, and seeded by clients: a shape declaring oslc:inversePropertyLabel
 * overrides it.
 */
export const BUILTIN_INVERSE_LABELS = [...LINK_PROFILE]
  .filter(([, row]) => row.inverseLabel)
  .map(([predicate, row]) => [predicate, row.inverseLabel]);
