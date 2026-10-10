# Proposed staff commit

Title: Add Healer blunt staffs and mage staff magic

Staged scope: 17 transparent photorealistic Healer staff PNGs; 13 earlier staffs made mage-only with passive abilities; blacksmith, combat, inventory and save integration; tests and both sets of generation/verification artifacts.

Only the three staff-related GameApp hunks are staged. Cinematic camera work, startup-loading changes and the separate BattleSpellOverlay edits remain unstaged and untouched.

Validation completed: production build, typecheck, 11 staff integration tests, and blacksmith visual/alpha checks.

Exact staged paths (50):

| Status | File |
|---|---|
| Added | [artifacts/healer-blunt-staffs-2026-10-09/README.md](C:/Engine2/artifacts/healer-blunt-staffs-2026-10-09/README.md) |
| Added | [artifacts/healer-blunt-staffs-2026-10-09/blacksmith-healer.html](C:/Engine2/artifacts/healer-blunt-staffs-2026-10-09/blacksmith-healer.html) |
| Added | [artifacts/healer-blunt-staffs-2026-10-09/blacksmith-healer.png](C:/Engine2/artifacts/healer-blunt-staffs-2026-10-09/blacksmith-healer.png) |
| Added | [artifacts/healer-blunt-staffs-2026-10-09/blacksmith-mage.html](C:/Engine2/artifacts/healer-blunt-staffs-2026-10-09/blacksmith-mage.html) |
| Added | [artifacts/healer-blunt-staffs-2026-10-09/blacksmith-mage.png](C:/Engine2/artifacts/healer-blunt-staffs-2026-10-09/blacksmith-mage.png) |
| Added | [artifacts/healer-blunt-staffs-2026-10-09/generation-manifest.json](C:/Engine2/artifacts/healer-blunt-staffs-2026-10-09/generation-manifest.json) |
| Added | [artifacts/healer-blunt-staffs-2026-10-09/staff-series.html](C:/Engine2/artifacts/healer-blunt-staffs-2026-10-09/staff-series.html) |
| Added | [artifacts/healer-blunt-staffs-2026-10-09/staff-series.png](C:/Engine2/artifacts/healer-blunt-staffs-2026-10-09/staff-series.png) |
| Added | [artifacts/healer-blunt-staffs-2026-10-09/verification.json](C:/Engine2/artifacts/healer-blunt-staffs-2026-10-09/verification.json) |
| Added | [artifacts/healer-blunt-staffs-high-tier-2026-10-09/README.md](C:/Engine2/artifacts/healer-blunt-staffs-high-tier-2026-10-09/README.md) |
| Added | [artifacts/healer-blunt-staffs-high-tier-2026-10-09/blacksmith-healer.html](C:/Engine2/artifacts/healer-blunt-staffs-high-tier-2026-10-09/blacksmith-healer.html) |
| Added | [artifacts/healer-blunt-staffs-high-tier-2026-10-09/blacksmith-healer.png](C:/Engine2/artifacts/healer-blunt-staffs-high-tier-2026-10-09/blacksmith-healer.png) |
| Added | [artifacts/healer-blunt-staffs-high-tier-2026-10-09/blacksmith-mage.html](C:/Engine2/artifacts/healer-blunt-staffs-high-tier-2026-10-09/blacksmith-mage.html) |
| Added | [artifacts/healer-blunt-staffs-high-tier-2026-10-09/blacksmith-mage.png](C:/Engine2/artifacts/healer-blunt-staffs-high-tier-2026-10-09/blacksmith-mage.png) |
| Added | [artifacts/healer-blunt-staffs-high-tier-2026-10-09/generation-manifest.json](C:/Engine2/artifacts/healer-blunt-staffs-high-tier-2026-10-09/generation-manifest.json) |
| Added | [artifacts/healer-blunt-staffs-high-tier-2026-10-09/high-tier-staffs.html](C:/Engine2/artifacts/healer-blunt-staffs-high-tier-2026-10-09/high-tier-staffs.html) |
| Added | [artifacts/healer-blunt-staffs-high-tier-2026-10-09/high-tier-staffs.png](C:/Engine2/artifacts/healer-blunt-staffs-high-tier-2026-10-09/high-tier-staffs.png) |
| Added | [artifacts/healer-blunt-staffs-high-tier-2026-10-09/staff-series.html](C:/Engine2/artifacts/healer-blunt-staffs-high-tier-2026-10-09/staff-series.html) |
| Added | [artifacts/healer-blunt-staffs-high-tier-2026-10-09/staff-series.png](C:/Engine2/artifacts/healer-blunt-staffs-high-tier-2026-10-09/staff-series.png) |
| Added | [artifacts/healer-blunt-staffs-high-tier-2026-10-09/verification.json](C:/Engine2/artifacts/healer-blunt-staffs-high-tier-2026-10-09/verification.json) |
| Added | [public/game/icons/weapons/bastao-curandeiro-01-freixo.png](C:/Engine2/public/game/icons/weapons/bastao-curandeiro-01-freixo.png) |
| Added | [public/game/icons/weapons/bastao-curandeiro-02-carvalho.png](C:/Engine2/public/game/icons/weapons/bastao-curandeiro-02-carvalho.png) |
| Added | [public/game/icons/weapons/bastao-curandeiro-03-bronze.png](C:/Engine2/public/game/icons/weapons/bastao-curandeiro-03-bronze.png) |
| Added | [public/game/icons/weapons/bastao-curandeiro-04-aco.png](C:/Engine2/public/game/icons/weapons/bastao-curandeiro-04-aco.png) |
| Added | [public/game/icons/weapons/bastao-curandeiro-05-ebano.png](C:/Engine2/public/game/icons/weapons/bastao-curandeiro-05-ebano.png) |
| Added | [public/game/icons/weapons/bastao-curandeiro-06-ferro-gravado.png](C:/Engine2/public/game/icons/weapons/bastao-curandeiro-06-ferro-gravado.png) |
| Added | [public/game/icons/weapons/bastao-curandeiro-07-prata.png](C:/Engine2/public/game/icons/weapons/bastao-curandeiro-07-prata.png) |
| Added | [public/game/icons/weapons/bastao-curandeiro-08-aco-negro.png](C:/Engine2/public/game/icons/weapons/bastao-curandeiro-08-aco-negro.png) |
| Added | [public/game/icons/weapons/bastao-curandeiro-09-mestre.png](C:/Engine2/public/game/icons/weapons/bastao-curandeiro-09-mestre.png) |
| Added | [public/game/icons/weapons/bastao-curandeiro-10-carvalho-blindado.png](C:/Engine2/public/game/icons/weapons/bastao-curandeiro-10-carvalho-blindado.png) |
| Added | [public/game/icons/weapons/bastao-curandeiro-11-ferro-rivetado.png](C:/Engine2/public/game/icons/weapons/bastao-curandeiro-11-ferro-rivetado.png) |
| Added | [public/game/icons/weapons/bastao-curandeiro-12-bronze-martelado.png](C:/Engine2/public/game/icons/weapons/bastao-curandeiro-12-bronze-martelado.png) |
| Added | [public/game/icons/weapons/bastao-curandeiro-13-aco-canelado.png](C:/Engine2/public/game/icons/weapons/bastao-curandeiro-13-aco-canelado.png) |
| Added | [public/game/icons/weapons/bastao-curandeiro-14-ebano-encouracado.png](C:/Engine2/public/game/icons/weapons/bastao-curandeiro-14-ebano-encouracado.png) |
| Added | [public/game/icons/weapons/bastao-curandeiro-15-prata-forjada.png](C:/Engine2/public/game/icons/weapons/bastao-curandeiro-15-prata-forjada.png) |
| Added | [public/game/icons/weapons/bastao-curandeiro-16-aco-damasco.png](C:/Engine2/public/game/icons/weapons/bastao-curandeiro-16-aco-damasco.png) |
| Added | [public/game/icons/weapons/bastao-curandeiro-17-mestre-relicario.png](C:/Engine2/public/game/icons/weapons/bastao-curandeiro-17-mestre-relicario.png) |
| Added | [qa/healer-staffs-audit.mjs](C:/Engine2/qa/healer-staffs-audit.mjs) |
| Modified | [src/ember/data.ts](C:/Engine2/src/ember/data.ts) |
| Added | [src/ember/healerBluntStaffs.ts](C:/Engine2/src/ember/healerBluntStaffs.ts) |
| Added | [src/ember/mageStaffMagic.ts](C:/Engine2/src/ember/mageStaffMagic.ts) |
| Modified | [src/ember/types.ts](C:/Engine2/src/ember/types.ts) |
| Modified | [src/game/GameApp.tsx](C:/Engine2/src/game/GameApp.tsx) |
| Modified | [src/game/InnScreen.tsx](C:/Engine2/src/game/InnScreen.tsx) |
| Modified | [src/game/combat.ts](C:/Engine2/src/game/combat.ts) |
| Modified | [src/game/data.ts](C:/Engine2/src/game/data.ts) |
| Modified | [src/game/engine.ts](C:/Engine2/src/game/engine.ts) |
| Modified | [src/game/save.ts](C:/Engine2/src/game/save.ts) |
| Modified | [src/game/types.ts](C:/Engine2/src/game/types.ts) |
| Added | [tests/healerStaffs.test.tsx](C:/Engine2/tests/healerStaffs.test.tsx) |

[Full staged textual diff](staff-staged.diff)

Staged fingerprint: 272c2b5c68d8d30d920e1ea3e0045c10b421b5cb5c828587c9dc229046327ca9
