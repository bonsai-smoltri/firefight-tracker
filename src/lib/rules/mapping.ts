import type { RuleConditions, RuleEffects, RuleMapping, RulePart } from '../../types/rules.ts'

/**
 * Every reviewed rule, keyed by name. Rule ids differ between books for the same rule, names
 * don't. `reviewed` holds the hashes of the rule texts each mapping was checked against; the
 * sync report and `mapping.test.ts` flag any text that hasn't been reviewed.
 *
 * Effects are written from the attack's point of view: a defender's Stealth is a negative
 * `hitModifier` on the defender side.
 */

const rated = (fallback: number) => (rating: number | null) => rating ?? fallback

const attacker = (effects: RulePart['effects'], conditions?: RulePart['conditions']): RulePart => ({
  side: 'attacker',
  effects,
  conditions,
})

const defender = (effects: RulePart['effects'], conditions?: RulePart['conditions']): RulePart => ({
  side: 'defender',
  effects,
  conditions,
})

const textOnly = (name: string, reviewed: string[], note?: string): RuleMapping => ({ name, reviewed, parts: [], note })

/** "When shooting/charging enemies over 9"/6" away": the same effect, two ways to trigger it. */
const atRange = (side: RulePart['side'], effects: RuleEffects, manual?: string): RulePart[] => [
  { side, effects, manual, conditions: { mode: 'shooting', situation: ['overNine'] } },
  { side, effects, manual, conditions: { mode: 'melee', situation: ['charging', 'chargeOverSix'] } },
]

/** A choice the player makes each time: one manual option per effect. */
const choice = (side: RulePart['side'], options: Record<string, RuleEffects>, conditions?: RuleConditions): RulePart[] =>
  Object.entries(options).map(([manual, effects]) => ({ side, effects, manual, conditions }))

const ONE_TO_THREE_AP = { 'rolled 1–3: AP(+1)': { ap: 1 }, 'rolled 4–6: +1 to hit': { hitModifier: 1 } }
const PICK_AP_OR_HIT = { 'AP(+1)': { ap: 1 }, '+1 to hit': { hitModifier: 1 } }
const SHAKEN_OR_FATIGUED: RuleConditions = { anySituation: ['targetShaken', 'targetFatigued'] }

const MAPPINGS: RuleMapping[] = [
  // Core rules that change attack numbers.
  {
    name: 'AP',
    reviewed: ['98c654a8', '3ad53794'],
    parts: [attacker((r) => ({ ap: rated(0)(r) }))],
  },
  {
    name: 'Aircraft',
    reviewed: ['51ad1df9'],
    parts: [defender({ hitModifier: -1 })],
    note: 'Also -12" range to target it',
  },
  {
    name: 'Artillery',
    reviewed: ['cbd35bdf'],
    parts: [
      attacker({ hitModifier: 1 }, { mode: 'shooting', situation: ['attackerHeld', 'overTwelve'] }),
      defender({ hitModifier: -1 }, { mode: 'shooting', situation: ['targetStationary', 'overTwelve'] }),
    ],
  },
  {
    name: 'Bane',
    reviewed: ['10f724cf'],
    parts: [attacker({ ignoresRegeneration: true, rerollDefenseFrom: 6 })],
  },
  {
    name: 'Blast',
    reviewed: ['5c3bdffd'],
    parts: [attacker((r) => ({ blast: rated(1)(r), ignoresCover: true }))],
    note: 'Hits split with enemies within 3" of the target are not modelled',
  },
  {
    name: 'Deadly',
    reviewed: ['338cb921'],
    parts: [attacker((r) => ({ woundMultiplier: rated(1)(r) }))],
  },
  {
    name: 'Furious',
    reviewed: ['6c240596'],
    parts: [attacker({ extraHitsOnSix: 1 }, { mode: 'melee', situation: ['charging'] })],
  },
  {
    name: 'Parry',
    reviewed: ['e1c597c4'],
    parts: [defender((r) => ({ parry: rated(1)(r) }), { mode: 'melee' })],
  },
  {
    name: 'Regeneration',
    reviewed: ['31eb04b2'],
    parts: [defender({ ignoreWoundsOn: 5 })],
  },
  {
    name: 'Relentless',
    reviewed: ['73674c73'],
    parts: [attacker({ extraHitsOnSix: 1 }, { mode: 'shooting', situation: ['overNine'] })],
  },
  {
    name: 'Reliable',
    reviewed: ['205ae791'],
    parts: [attacker({ quality: 2 })],
  },
  {
    name: 'Rending',
    reviewed: ['fb3af34e'],
    parts: [attacker({ ignoresRegeneration: true, apOnSix: 4 })],
  },
  {
    name: 'Shred',
    reviewed: ['260829ed'],
    parts: [attacker({ extraWoundsOnOne: 1 })],
  },
  {
    name: 'Stealth',
    reviewed: ['d23a93a8'],
    parts: [defender({ hitModifier: -1 }, { mode: 'shooting', situation: ['overNine'] })],
  },
  {
    name: 'Surge',
    reviewed: ['9203a390'],
    parts: [attacker({ extraHitsOnSix: 1 })],
  },
  {
    name: 'Thrust',
    reviewed: ['e5e1787d'],
    parts: [attacker({ hitModifier: 1, ap: 1 }, { mode: 'melee', situation: ['charging'] })],
  },

  // Core rules that change no attack numbers.
  textOnly('Ambush', ['56065363']),
  textOnly('Assault', ['4e75bac8'], 'Weapon can be used for shooting and melee'),
  textOnly('Banner', ['2329d29a']),
  textOnly('Brace', ['b3f29666']),
  textOnly('Caster', ['64d8c785']),
  textOnly('Counter', ['73431105']),
  textOnly('Fast', ['e39cc967']),
  textOnly('Fear', ['da7864cf']),
  textOnly('Fearless', ['f86161f7']),
  textOnly('Flying', ['c77360ae']),
  textOnly('Hero', ['4ec43b22']),
  textOnly('Immobile', ['29746877']),
  textOnly('Impact', ['ed8a2309'], 'Separate attack, not part of this weapon'),
  textOnly('Indirect', ['6f2a11e1'], 'Ignores cover from sight blockers only: turn Cover off if that is the only cover'),
  textOnly('Limited', ['c029c210']),
  textOnly('Musician', ['d9cf9f6d']),
  textOnly('Scout', ['a3abaaf8']),
  textOnly('Slow', ['12ad5d33']),
  textOnly('Spell Amplifier', ['3fa987ba']),
  textOnly('Strider', ['5c500e0b']),
  textOnly('Takedown', ['ba4e5d3f']),
  textOnly('Tough', ['0b2138df'], 'Read as the unit’s wounds per model'),
  textOnly('Transport', ['69ddbecf']),

  // Faction rules.
  {
    name: 'Anti-Cover',
    reviewed: ['c7954af3'],
    parts: [attacker({ ignoresCover: true })],
  },
  {
    name: 'Anti-Regen',
    reviewed: ['aad5689b'],
    parts: [attacker({ ignoresRegeneration: true })],
  },
  {
    name: 'Armor',
    reviewed: ['8e635239'],
    parts: [defender((r) => (r === null ? {} : { defense: r }))],
  },
  {
    name: 'Brutal',
    reviewed: ['028f981a'],
    parts: [
      attacker({ extraHitsOnSix: 1 }, { mode: 'shooting', situation: ['overNine'] }),
      attacker({ extraHitsOnSix: 1 }, { mode: 'melee', situation: ['charging', 'chargeOverSix'] }),
    ],
  },
  {
    name: 'Enhanced Brutal',
    reviewed: ['593ae8fc'],
    enhances: 'Brutal',
    parts: [attacker({ extraHitsOnSix: 1 })],
  },
  {
    name: 'Defense',
    reviewed: ['a500944d'],
    parts: [defender((r) => ({ defenseModifier: rated(1)(r) }))],
  },
  {
    name: 'Entrenched',
    reviewed: ['059a3d56'],
    parts: [defender({ hitModifier: -1 }, { mode: 'shooting', situation: ['targetStationary', 'overTwelve'] })],
  },
  {
    name: 'Fortified',
    reviewed: ['b7005f67'],
    parts: [defender({ apReduction: 1 })],
  },
  {
    name: 'Fracture',
    reviewed: ['46fed211'],
    parts: [attacker({ apOnSix: 2 })],
  },
  {
    name: 'Fragment',
    reviewed: ['3b45f9f9'],
    parts: [attacker({ rerollDefenseFrom: 4 }, { targetDefense: [4, 6] })],
  },
  {
    name: 'Good Shot',
    reviewed: ['de2695ce'],
    parts: [attacker({ hitModifier: 1 }, { mode: 'shooting' })],
  },
  {
    name: 'Imprecise',
    reviewed: ['a43518d4'],
    parts: [attacker({ hitModifier: -1 })],
  },
  {
    name: 'Piercing Charge',
    reviewed: ['e671acd8'],
    parts: [attacker({ ap: 1 }, { mode: 'melee', situation: ['charging'] })],
  },
  {
    name: 'Precise',
    reviewed: ['e7e62c7e'],
    parts: [attacker({ hitModifier: 1 })],
  },
  {
    name: 'Predator',
    reviewed: ['d22d6e4f'],
    parts: [attacker({ extraAttacks: { count: 1, on: 6 } })],
  },
  {
    name: 'Enhanced Predator',
    reviewed: ['c51fe6cc'],
    enhances: 'Predator',
    parts: [attacker({ extraAttacks: { count: 1, on: 5 } })],
  },
  {
    name: 'Protected',
    reviewed: ['0c9b390f'],
    parts: [defender({ ignoreWoundsOn: 6 })],
  },
  {
    name: 'Enhanced Protected',
    reviewed: ['a4a8a9f2'],
    enhances: 'Protected',
    parts: [defender({ ignoreWoundsOn: 5 })],
  },
  {
    name: 'Self-Repair',
    reviewed: ['0c9b390f'],
    parts: [defender({ ignoreWoundsOn: 6 })],
  },
  {
    name: 'Enhanced Self-Repair',
    reviewed: ['31b0165e'],
    enhances: 'Self-Repair',
    parts: [defender({ ignoreWoundsOn: 5 })],
  },
  {
    name: 'Protection Feat',
    reviewed: ['cd8b9c41'],
    parts: [{ side: 'defender', manual: true, effects: { ignoreWoundsOn: 5 } }],
    note: 'Once per game',
  },
  {
    name: 'Sergeant',
    reviewed: ['0d312afb'],
    parts: [attacker({ ap: 1 })],
  },
  {
    name: 'Shatter',
    reviewed: ['5169f502'],
    parts: [attacker({ apOnSix: 3 })],
  },
  {
    name: 'Unstoppable',
    reviewed: ['289909f6'],
    parts: [attacker({ ignoresRegeneration: true, ignoresNegativeModifiers: true })],
  },
  {
    name: 'Violent',
    reviewed: ['f74b2fcd'],
    parts: [
      attacker({ extraWoundsOnOne: 1 }, { mode: 'shooting', situation: ['overNine'] }),
      attacker({ extraWoundsOnOne: 1 }, { mode: 'melee', situation: ['charging', 'chargeOverSix'] }),
    ],
  },
  {
    name: 'Enhanced Violent',
    reviewed: ['ea1d9539'],
    enhances: 'Violent',
    parts: [attacker({ extraWoundsOnOne: 1 })],
  },

  // Faction hit modifiers.
  { name: 'Bad Shot', reviewed: ['f4f4b7dc'], parts: [attacker({ hitModifier: -1 }, { mode: 'shooting' })] },
  { name: 'Dodge', reviewed: ['71e40097'], parts: [defender({ hitModifier: -1 }, { mode: 'melee', notSituation: ['targetFatigued'] })] },
  { name: 'Evasive', reviewed: ['19380472'], parts: [defender({ hitModifier: -1 })] },
  { name: 'Melee Evasion', reviewed: ['dd06e6b5'], parts: [defender({ hitModifier: -1 }, { mode: 'melee' })] },
  { name: 'Grounded Evasion', reviewed: ['3036a245'], parts: [defender({ hitModifier: -1 }, { situation: ['targetNearTerrain'] })] },
  { name: 'Grounded Precision', reviewed: ['b4b060b2'], parts: [attacker({ hitModifier: 1 }, { situation: ['attackerNearTerrain'] })] },
  { name: 'Screened', reviewed: ['d8d5e666'], parts: atRange('defender', { hitModifier: -1 }) },
  { name: 'Enhanced Screened', reviewed: ['ab4e406a'], enhances: 'Screened', parts: [defender({ hitModifier: -1 })] },
  {
    name: 'Precision Marksman',
    reviewed: ['76acbd2c'],
    parts: [attacker({ hitModifier: 1 }, { mode: 'shooting', situation: ['overNine'] })],
  },
  {
    name: 'Enhanced Precision Marksman',
    reviewed: ['8ff0592e'],
    enhances: 'Precision Marksman',
    parts: [attacker({ hitModifier: 1 })],
  },
  { name: 'Precision Charge', reviewed: ['3c622f90'], parts: [attacker({ hitModifier: 1 }, { mode: 'melee', situation: ['charging'] })] },
  { name: 'Precision Fighter', reviewed: ['8f0c45f2'], parts: [attacker({ hitModifier: 1 }, { mode: 'melee' })] },
  {
    name: 'Precision Shooter',
    reviewed: ['6f666e94', '930ba860'],
    synthetic: ['Precision Shooter Aura', 'Precision Shooter Buff'],
    parts: [attacker({ hitModifier: 1 }, { mode: 'shooting' })],
  },
  {
    name: 'Precision Attacks',
    reviewed: ['175f1a6b'],
    synthetic: ['Precision Attacks Buff'],
    parts: [attacker({ hitModifier: 1 })],
  },
  {
    name: 'Instinctive',
    reviewed: ['f275f05f'],
    parts: [{ side: 'attacker', manual: 'attacking the closest target', effects: { hitModifier: 1 } }],
  },
  {
    name: 'Infiltrating Precision Strike',
    reviewed: ['472d7b1a'],
    parts: [{ side: 'attacker', manual: 'deployed this round', effects: { hitModifier: 1 }, conditions: { mode: 'melee' } }],
  },

  // Faction AP.
  { name: 'Piercing Warrior', reviewed: ['db33d4ef'], parts: atRange('attacker', { ap: 1 }) },
  { name: 'Enhanced Piercing Warrior', reviewed: ['f90a6109'], enhances: 'Piercing Warrior', parts: [attacker({ ap: 1 })] },
  { name: 'Piercing Marksman', reviewed: ['749f800a'], parts: [attacker({ ap: 1 }, { mode: 'shooting', situation: ['overNine'] })] },
  {
    name: 'Piercing Fighter',
    reviewed: ['254f4e98'],
    synthetic: ['Piercing Fighter Aura'],
    parts: [attacker({ ap: 1 }, { mode: 'melee' })],
  },
  {
    name: 'Piercing Shooter',
    reviewed: ['ac66ee80'],
    synthetic: ['Piercing Shooter Aura'],
    parts: [attacker({ ap: 1 }, { mode: 'shooting' })],
  },
  {
    name: 'Piercing Fighting',
    reviewed: ['6464095f'],
    synthetic: ['Piercing Fighting Mark'],
    parts: [attacker({ ap: 1 }, { mode: 'melee' })],
  },
  { name: 'Destructive', reviewed: ['c530118e'], parts: [attacker({ ap: 1 }, { situation: ['targetAboveHalf'] })] },
  {
    name: 'Disintegrate',
    reviewed: ['56607cbe'],
    parts: [attacker({ ignoresRegeneration: true }), attacker({ ap: 2 }, { targetToughAtLeast: 9 })],
  },
  {
    name: 'Puncture',
    reviewed: ['fbf08377'],
    parts: [attacker({ ignoresRegeneration: true }), attacker({ ap: 2 }, { targetDefense: [2, 3] })],
  },
  { name: 'Purge', reviewed: ['a3c876ef'], parts: [attacker({ ap: 2 }, SHAKEN_OR_FATIGUED)] },
  {
    name: 'Demolish',
    reviewed: ['d5a1dfbd'],
    parts: [attacker({ ignoresCover: true }), attacker({ ap: 1 }, { situation: ['targetNearTerrain'] })],
  },
  {
    name: 'Melee Slayer',
    reviewed: ['7491f929'],
    parts: [attacker({ ap: 2 }, { mode: 'melee', situation: ['charging'], targetToughAtLeast: 9 })],
  },
  {
    name: 'Ranged Slayer',
    reviewed: ['0a7d7b6a'],
    parts: [attacker({ ap: 2 }, { mode: 'shooting', situation: ['attackerHeld'], targetToughAtLeast: 9 })],
  },
  {
    name: 'Slayer',
    reviewed: ['a364bed4'],
    parts: [
      attacker({ ap: 2 }, { mode: 'shooting', situation: ['attackerHeld'], targetToughAtLeast: 9 }),
      attacker({ ap: 2 }, { mode: 'melee', situation: ['charging'], targetToughAtLeast: 9 }),
    ],
  },
  {
    name: 'Pierce',
    reviewed: ['020d79c5'],
    parts: [attacker({ ignoresDefenseBonuses: true }), attacker({ ap: 1 }, { situation: ['overHalfRange'] })],
  },
  {
    name: 'Hazardous',
    reviewed: ['82ff4e1f'],
    parts: [attacker({ ap: 4 })],
    note: 'Each unmodified 1 to hit wounds the attacker (X wounds with Blast(X) or Deadly(X))',
  },

  // Faction choices and rolled effects.
  { name: 'Unpredictable', reviewed: ['045abe85'], parts: choice('attacker', ONE_TO_THREE_AP) },
  { name: 'Unpredictable Fighter', reviewed: ['13668b76'], parts: choice('attacker', ONE_TO_THREE_AP, { mode: 'melee' }) },
  { name: 'Unpredictable Shooter', reviewed: ['4193e808'], parts: choice('attacker', ONE_TO_THREE_AP, { mode: 'shooting' }) },
  { name: 'Versatile Expert', reviewed: ['da56f862'], parts: choice('attacker', PICK_AP_OR_HIT) },
  {
    name: 'Versatile Warrior',
    reviewed: ['a1279cf8'],
    parts: Object.entries(PICK_AP_OR_HIT).flatMap(([option, effects]) => atRange('attacker', effects, option)),
  },
  {
    name: 'Enhanced Versatile Warrior',
    reviewed: ['d4e4f4ad'],
    enhances: 'Versatile Warrior',
    parts: choice('attacker', PICK_AP_OR_HIT),
  },
  {
    name: 'Versatile Defense',
    reviewed: ['e6ec4fc8'],
    parts: Object.entries({ '+1 Defense': { defenseModifier: 1 }, '-1 to hit': { hitModifier: -1 } }).flatMap(
      ([option, effects]) => atRange('defender', effects, option),
    ),
  },

  // Faction Defense.
  { name: 'Guarded', reviewed: ['0b2feb14'], parts: atRange('defender', { defenseModifier: 1 }) },
  { name: 'Enhanced Guarded', reviewed: ['837d6471'], enhances: 'Guarded', parts: [defender({ defenseModifier: 1 })] },
  { name: 'Grounded Defense', reviewed: ['2d1e8216'], parts: [defender({ defenseModifier: 1 }, { situation: ['targetNearTerrain'] })] },
  { name: 'Shielded', reviewed: ['77fb7f51'], parts: [defender({ defenseModifier: 1 })], note: 'Not against spells' },
  { name: 'Enhanced Fortified', reviewed: ['33d5ab86'], enhances: 'Fortified', parts: [defender({ apReduction: 2 })] },

  // Faction Defense re-rolls.
  { name: 'Vicious', reviewed: ['9c47d601'], parts: [attacker({ rerollDefenseFrom: 6 })] },
  { name: 'Enhanced Vicious', reviewed: ['f858c35c'], enhances: 'Vicious', parts: [attacker({ rerollDefenseFrom: 5 })] },
  { name: 'Lacerate', reviewed: ['14bb56a6'], parts: [attacker({ rerollDefenseFrom: 6 })] },
  { name: 'Decimate', reviewed: ['7cdb4414'], parts: [attacker({ rerollDefenseFrom: 6 }, { situation: ['targetAboveHalf'] })] },
  { name: 'Smash', reviewed: ['79089806'], parts: [attacker({ rerollDefenseFrom: 6 }, { situation: ['overHalfRange'] })] },
  {
    name: 'Obliterate',
    reviewed: ['c35c26b4'],
    parts: [attacker({ ignoresRegeneration: true }), attacker({ rerollDefenseFrom: 4 }, { targetToughAtLeast: 9 })],
  },
  { name: 'Reap', reviewed: ['8ec81803'], parts: [attacker({ rerollDefenseFrom: 4 }, SHAKEN_OR_FATIGUED)] },

  // Faction wound ignoring. Attacks in this app are never spells.
  { name: 'Spell Resistance', reviewed: ['742cc594'], parts: [defender({ ignoreWoundsOn: 6 })], note: '2+ against spells' },
  { name: 'Warding', reviewed: ['d673f7f8'], parts: atRange('defender', { ignoreWoundsOn: 6 }), note: '2+ against spells' },

  { name: 'Predator Shooter', reviewed: ['7d0ef1ee'], parts: [attacker({ extraAttacks: { count: 1, on: 6 } }, { mode: 'shooting' })] },

  // Token rules: pick how many tokens the unit has.
  {
    name: 'Piercing Growth',
    reviewed: ['de62e388'],
    parts: choice('attacker', { '2–3 tokens': { ap: 1 }, '4 tokens': { ap: 2 } }),
  },
  {
    name: 'Precision Growth',
    reviewed: ['9748da12'],
    parts: choice('attacker', { '2–3 tokens': { hitModifier: 1 }, '4 tokens': { hitModifier: 2 } }),
  },
  {
    name: 'Defensive Growth',
    reviewed: ['72987b65'],
    parts: choice('defender', { '2–3 tokens': { defenseModifier: 1 }, '4 tokens': { defenseModifier: 2 } }),
  },
  {
    name: 'Fortified Growth',
    reviewed: ['f9f5eecc'],
    parts: choice('defender', { '2–3 tokens': { apReduction: 1 }, '4 tokens': { apReduction: 2 } }),
  },
  {
    name: 'Piercing Frenzy',
    reviewed: ['b644ed76'],
    parts: choice('attacker', { '1 token': { ap: 1 }, '2 tokens': { ap: 2 } }),
  },
  {
    name: 'Precision Frenzy',
    reviewed: ['77826904'],
    parts: choice('attacker', { '1 token': { hitModifier: 1 }, '2 tokens': { hitModifier: 2 } }),
  },
  {
    name: 'Defensive Frenzy',
    reviewed: ['21d55d0f'],
    parts: choice('defender', { '1 token': { defenseModifier: 1 }, '2 tokens': { defenseModifier: 2 } }),
  },

  // Markers on enemy units that any friendly unit can use.
  { name: 'Precision Target', reviewed: ['93f2af24'], armyWide: true, parts: [attacker({ hitModifier: 1 })] },
  { name: 'Piercing Target', reviewed: ['34355952'], armyWide: true, parts: [attacker({ ap: 1 })] },
  { name: 'Precision Tag', reviewed: ['efba4648'], armyWide: true, parts: [attacker({ hitModifier: 1 })], note: 'Removes one token' },
  { name: 'Piercing Tag', reviewed: ['184cf916'], armyWide: true, parts: [attacker({ ap: 1 })], note: 'Removes one token' },
  {
    name: 'Precision Spotter',
    reviewed: ['5ce1e8ef'],
    armyWide: true,
    parts: [attacker({ hitModifier: 1 })],
    note: '+1 per token removed; one token assumed',
  },
  {
    name: 'Piercing Spotter',
    reviewed: ['03af18f9'],
    armyWide: true,
    parts: [attacker({ ap: 1 })],
    note: '+AP(1) per token removed; one token assumed',
  },
  {
    name: 'Vengeance',
    reviewed: ['a09820dd'],
    armyWide: true,
    parts: [attacker({ hitModifier: 1 })],
    note: '+1 per Vengeance token on the target; one token assumed',
  },

  // Separate attacks and non-attack effects.
  textOnly('Crossing Strike', ['b0281fbb'], 'Separate attack when moving through enemies'),
  textOnly('Heavy Impact', ['e5fdd6c3'], 'Separate attack, like Impact'),
  textOnly('Surprise Attack', ['05562925'], 'Separate attack on first activation'),
  textOnly('Takedown Shot', ['ca0c733e'], 'Separate once-per-game attack'),
  textOnly('Takedown Strike', ['797635c1'], 'Separate once-per-game attack'),
  textOnly('Retaliate', ['0342b33a'], 'The attacker takes hits back per wound'),
  textOnly('Scourge', ['9e9b5a7c'], 'Affects melee results and morale, not wounds'),

  { name: 'Enhanced Warding', reviewed: ['70b1e47e'], enhances: 'Warding', parts: [defender({ ignoreWoundsOn: 6 })] },

  // Faction rules checked and found to change no attack numbers: movement, range, deployment,
  // morale and spells. Listing them keeps the sync report focused on rules nobody has read.
  textOnly('Agile', ['6c24d366']),
  textOnly('Ambush Beacon', ['8758f91e']),
  textOnly('Ambush Re-Deployment', ['1ce316e7']),
  textOnly('Battleborn', ['ebade725']),
  textOnly('Bounding', ['3f44ff2e']),
  textOnly('Bravery Aura', ['a27a0972']),
  textOnly('Brute Courage', ['ebade725']),
  textOnly('Caster Group', ['e6cc8a93']),
  textOnly('Casting Buff', ['12ae4dcc']),
  textOnly('Crossing Attack', ['4a756411'], 'Separate attack when moving through enemies'),
  textOnly('Dangerous Terrain Debuff', ['cea280cd']),
  textOnly('Darkborn', ['ef20e9bd'], 'Reduces the attacker’s range'),
  textOnly('Dash', ['bb2a0547']),
  textOnly('Deathstrike', ['fe4244be'], 'The attacker takes hits if this model dies in melee'),
  textOnly('Delayed Action', ['3bbb5a31']),
  textOnly('Enhanced Agile', ['8ea205ee']),
  textOnly('Enhanced Darkborn', ['d4a7991f']),
  textOnly('Enhanced Extra Reach', ['f9d4f301']),
  textOnly('Enhanced Guerrilla', ['f7b738ec']),
  textOnly('Enhanced Harassing', ['fe48b2d4']),
  textOnly('Enhanced Highborn', ['96829545']),
  textOnly('Enhanced Hit & Run', ['504c10bc']),
  textOnly('Enhanced Lustbound', ['8b7714ce']),
  textOnly('Enhanced Nimble', ['4c50d5db']),
  textOnly('Enhanced Rapid Blink', ['5493986b']),
  textOnly('Enhanced Runner', ['911ff2e4']),
  textOnly('Enhanced Scurry', ['b6b63050']),
  textOnly('Enhanced Shadow Operative', ['11efe847']),
  textOnly('Enhanced Shadowborn', ['86ba826b']),
  textOnly('Enhanced Shrouded', ['a8101107']),
  textOnly('Enhanced Wolfborn', ['8934b89b']),
  textOnly('Extra Reach', ['4bdac2f4']),
  textOnly('Fanatic', ['f7d5c829']),
  textOnly('Guerrilla', ['ff79268c']),
  textOnly('Harassing', ['ff79268c']),
  textOnly('Highborn', ['4bdac2f4']),
  textOnly('Hit & Run', ['ff79268c']),
  textOnly('Hit & Run Fighter', ['48c73cba']),
  textOnly('Hit & Run Shooter', ['59784caf']),
  textOnly('Increased Shooting Range', ['6a8067b2']),
  textOnly('Inquisitorial Agent', ['dec0d580']),
  textOnly('Lustbound', ['6c24d366']),
  textOnly('Martial Prowess', ['dec0d580']),
  textOnly('Melee Shrouding', ['53d2a1e3'], 'Reduces the charger’s range'),
  textOnly('Mend', ['81891ed3']),
  textOnly('Mind Control', ['c5369d9d']),
  textOnly('Morale Debuff', ['df9d8f74']),
  textOnly('Nimble', ['ddfc49fa']),
  textOnly('Quick', ['314236a1']),
  textOnly('Quick Shot', ['dcf4a0e5']),
  textOnly('Quick Throw', ['7025a2e0']),
  textOnly('Ranged Shrouding', ['60afb98b'], 'Reduces the shooter’s range'),
  textOnly('Rapid Ambush', ['48a904aa']),
  textOnly('Rapid Blink', ['ddfc49fa']),
  textOnly('Rapid Charge', ['f6dcf878']),
  textOnly('Rapid Rush', ['7b1784d0']),
  textOnly('Re-Deployment', ['c9bcabf6']),
  textOnly('Reinforcement', ['39e81039']),
  textOnly('Runner', ['6c24d366']),
  textOnly('Scurry', ['6c24d366']),
  textOnly('Self-Destruct', ['aaea3ee2'], 'The attacker takes hits if this model dies in melee'),
  textOnly('Shadow Operative', ['ef20e9bd'], 'Reduces the attacker’s range'),
  textOnly('Shadowborn', ['ef20e9bd'], 'Reduces the attacker’s range'),
  textOnly('Shrouded', ['ef20e9bd'], 'Reduces the attacker’s range'),
  textOnly('Spawn', ['7bf3cc91']),
  textOnly('Speed Feat', ['bc7d0403']),
  textOnly('Spell Accumulator', ['b7884eac']),
  textOnly('Spell Conduit', ['fe6086bf']),
  textOnly('Spell Drain', ['8c5ab5e0']),
  textOnly('Split', ['c3e539ff']),
  textOnly('Steadfast', ['ebade725']),
  textOnly('Teleport', ['d32f9dd6']),
  textOnly('Union Assault', ['f7d5c829']),
  textOnly('Unwieldy', ['aefacc37'], 'Strikes last when charging'),
  textOnly('Vanguard', ['f7d5c829']),
  textOnly('Versatile Reach', ['d3751a12']),
  textOnly('Wolfborn', ['ddfc49fa']),

  textOnly('Ambushing Piercing Shot', ['193fc3fa'], 'AP(+1) when shooting on the round it deploys: not modelled yet'),
  textOnly('Coordinate', ['d79b988a']),
  textOnly('Enhanced Hold the Line', ['03636a37']),
  textOnly('Enhanced Valiant', ['69caa6e7']),
  textOnly('Extended Buff Range', ['407d4d26']),
  textOnly('Hold the Line', ['912185a2']),
  textOnly('Infiltrate', ['7d6c3ced']),
  textOnly('No Retreat', ['cbd9c360']),
  textOnly('Rapid Advance', ['2916d00c']),
  textOnly('Ravage', ['98cd7188'], 'Separate attack, not part of this weapon'),
  textOnly('Reanimation', ['900e67d4']),
  textOnly('Repel Ambushers', ['9d3951a5']),
  textOnly('Swift', ['6f43ff1b']),
  textOnly('Unique Hero', ['ccc5f686']),
  textOnly('Valiant', ['912185a2']),
]

export const RULE_MAPPINGS: ReadonlyMap<string, RuleMapping> = new Map(MAPPINGS.map((m) => [m.name, m]))
