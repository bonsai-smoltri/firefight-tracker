import type { RuleMapping, RulePart } from '../../types/rules.ts'

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
