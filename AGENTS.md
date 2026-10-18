# Roster scheduling rules

This file is the source of truth for roster-generation priorities. Read it before changing `src/utils/rosterGenerator.ts` or its scheduling tests, and keep the implementation and regression coverage aligned with these rules.

## Valid schedule requirements

Fairness is considered only among structurally valid schedules. Keep the requested number of courts, four distinct players per court, valid team sizes, format-specific team composition, and exactly one status per player per round: playing once or sitting out. A player must never appear twice in the same round. In fixed-partner mode, keep each original team together.

Build eligible sit-out, partner, and opponent sets from the active roster settings and court rules. A fixed partner's only eligible partner is their assigned teammate; their possible opponents are players on other fixed teams. In strict mixed mode, partners must be opposite gender, while opponents may be same or opposite gender. Do not assume the partner and opponent sets are the same.

When appending rounds to an existing roster, include all earlier rounds when checking cycles and counts. A new section of a roster must not restart anyone's fairness history.

## Priority order

Compare candidate schedules lexicographically in this order. A lower-priority improvement must never outweigh a violation at a higher priority.

1. **No back-to-back sit-outs.** Treat this as a hard constraint whenever a structurally valid schedule can avoid it.
2. **Complete sit-out cycles before repeating.** No eligible player may sit out for the next time until every eligible player has sat out the preceding number of times. This means everyone gets one sit-out before anyone gets a second, and the same rule applies to later cycles. If a round has multiple sitters, evaluate them as one round: a sitter cannot catch up with another sitter within that same round.
3. **Complete partner cycles before repeating.** For each player, do not partner with someone for the next time until they have partnered with every eligible partner the preceding number of times. Everyone must get each eligible partnership once before any partnership happens a second time; apply the same rule to later repeats. A repeat is premature if either player has not completed their current partner cycle.
4. **Complete opponent cycles before repeating.** Apply the same cycle rule to opponents: everyone must face each eligible opponent once before any opponent is faced a second time, and each later cycle should be completed before its next repeat. A repeat is premature if either player has not completed their current opponent cycle. Opponents met in the same round count together, so that round may complete the cycle for both players.
5. **Complete secondary co-sitter exposure cycles.** Where a repeat-free rotation is feasible (for example, exactly one co-sit pair per round), avoid repeating the same co-sitter pair until each player's eligible co-sitter set has been covered. This is below the sit-out, partner, and opponent cycles above.
6. **Balance encounter counts after exposure cycles.** Once the higher-priority cycles are satisfied as far as the format permits, balance sit-out, partner, and opponent counts as evenly as possible.

After those six priorities, preserve the existing tie-breakers: avoid back-to-back partner or opponent repeats and retain roster variation where requested. These tie-breakers must not override priorities 1–6.

If every rule cannot be satisfied, preserve the higher priorities and minimize violations at the highest priority that remains unsatisfied. Do not claim a globally optimal schedule when the search is heuristic or candidate-limited. Tests must check exposure order and explain any known structural limitation; final totals alone do not prove that repeats happened at the right time.

## 3M/3F example

For a strict mixed roster with 3 men, 3 women, one court, and 9 rounds:

- In each consecutive block of 3 rounds, every man and every woman should sit once. No player may sit in consecutive rounds.
- Each man/woman pair should partner exactly twice. Each player must partner with all three eligible partners before any partnership repeats.
- Each player can oppose all five other players under this format, including same-gender opponents. The generator should minimize any opponent-cycle violations only after satisfying the sit-out and partner-cycle priorities; the test should not treat balanced final opponent totals as proof that the opponent cycle was respected.
- Exhaustive comparison of valid 3-round sitter cycles and partner orientations found no schedule with zero opponent-cycle violations while preserving the rules above; the best cycle score has 11 early opponent-repeat events. The finite search enumerated all male/female sitter permutations in each of the three blocks, rejected back-to-back sitters, evaluated all 512 partner-orientation matrices, retained partner-cycle-perfect schedules, and counted opponent links as a same-round batch. Keep this as an explicit limitation and regression target, not as a claim that the opponent rule was fully satisfied.

When changing the generator, add or update focused regression tests for the stated priorities and this example. Check each cycle in encounter order, including any prior rounds, and use the same opponent-pair key format as the generator's diagnostics.
