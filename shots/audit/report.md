# Sprite edge audit

The current manifest has **18 directories**, versus 17 in the task description. All are covered. Originals and sprite-cleanup.json are untouched.

Every PNG frame was measured at native resolution, one at a time. Edge score is the median percentage of nearby semi-transparent pixels with a substantial RGB departure toward neutral gray. Shadow score is the 90th-percentile percentage of visible pixels that are dark, neutral, semi-transparent and near/below the lowest opaque feet region. Blobs is the maximum number of disconnected alpha components of at least 12 pixels. Natural gray materials, smoke, accessories and death poses can cause false positives; these measurements cannot prove Veo versus Hydra provenance. Contact sheets show the most suspicious frame; display thumbnails do not change originals.

| Unit | Frames | Edge score | Max blobs | Shadow score | Recommendation | Evidence |
|---|---:|---:|---:|---:|---|---|
| familiar2 | 180 | 77.60% | 1 | 2.04% | Review edge cleaning | [contact sheet](familiar2.png) |
| apparition | 276 | 68.08% | 8 | 2.33% | Review edge cleaning | [contact sheet](apparition.png) |
| carnivorous-plant-001 | 180 | 63.54% | 8 | 4.64% | Review edge cleaning | [contact sheet](carnivorous-plant-001.png) |
| sapling-001 | 216 | 62.25% | 15 | 3.69% | Review edge cleaning | [contact sheet](sapling-001.png) |
| jacare | 216 | 51.05% | 1 | 3.56% | Review edge cleaning | [contact sheet](jacare.png) |
| familiar4 | 144 | 46.70% | 30 | 4.72% | Review edge cleaning | [contact sheet](familiar4.png) |
| zombieDog | 252 | 42.52% | 1 | 1.59% | Review edge cleaning | [contact sheet](zombieDog.png) |
| salazar | 16 | 42.07% | 0 | 0.55% | Review edge cleaning | [contact sheet](salazar.png) |
| undeadOx | 216 | 26.73% | 5 | 2.29% | Review edge cleaning | [contact sheet](undeadOx.png) |
| familiar | 28 | 15.84% | 4 | 0.00% | Review edge cleaning | [contact sheet](familiar.png) |
| Kael_Final/kael-final-002 | 108 | 11.02% | 4 | 1.97% | Review edge cleaning | [contact sheet](Kael_Final__kael-final-002.png) |
| aldric | 252 | 9.72% | 1 | 0.11% | Review edge cleaning | [contact sheet](aldric.png) |
| familiar3 | 216 | 9.28% | 3 | 0.65% | Review edge cleaning | [contact sheet](familiar3.png) |
| voss | 16 | 6.44% | 0 | 0.65% | Review edge cleaning | [contact sheet](voss.png) |
| malrec | 216 | 5.94% | 35 | 0.09% | Review edge cleaning | [contact sheet](malrec.png) |
| neera | 288 | 3.08% | 5 | 0.17% | Review shadow/blobs only | [contact sheet](neera.png) |
| militia-v2 | 216 | 2.22% | 1 | 0.41% | Keep unchanged pending visual review | [contact sheet](militia-v2.png) |
| neera/neera-v2-001 | 288 | 1.99% | 1 | 0.14% | Keep unchanged pending visual review | [contact sheet](neera__neera-v2-001.png) |

Apply no automatic cleanup based on these scores. Review the sheets to select the cleanup list. Source-generation labels remain unknown without provenance metadata.

## Additional visual evidence

[Overview of all 18 units](overview.png). Separate first-frame sheets use an actual flagged edge pixel for the enlarged crop and preserve the earlier worst-frame sheets.

- [familiar2 edge detail](familiar2-edge.png)
- [apparition edge detail](apparition-edge.png)
- [carnivorous-plant-001 edge detail](carnivorous-plant-001-edge.png)
- [sapling-001 edge detail](sapling-001-edge.png)
- [jacare edge detail](jacare-edge.png)
- [familiar4 edge detail](familiar4-edge.png)
- [zombieDog edge detail](zombieDog-edge.png)
- [salazar edge detail](salazar-edge.png)
- [undeadOx edge detail](undeadOx-edge.png)
- [familiar edge detail](familiar-edge.png)
- [Kael_Final/kael-final-002 edge detail](Kael_Final__kael-final-002-edge.png)
- [aldric edge detail](aldric-edge.png)
- [familiar3 edge detail](familiar3-edge.png)
- [voss edge detail](voss-edge.png)
- [malrec edge detail](malrec-edge.png)
- [neera edge detail](neera-edge.png)
- [militia-v2 edge detail](militia-v2-edge.png)
- [neera/neera-v2-001 edge detail](neera__neera-v2-001-edge.png)

Visual review: Aldric and familiar3 show narrow pale fringes; familiar2 has a pronounced pale fringe along tendrils. Kael attack frame atk-21.png has a clearly visible baked ground shadow. Neera variants and militia-v2 are the strongest keep-unchanged candidates. Apparition has intrinsically gray clothing, and familiar4 has naturally translucent-looking tendrils, so their high scores are especially ambiguous. Malrec detached details may be weapon/cloth effects; inspect before removing. Salazar and Voss are small legacy frames; inspect at native scale. Plants, jacare, undeadOx and zombieDog merit manual edge review, but the displayed evidence does not establish their source generator. Recommend reviewing Aldric, familiar2 and familiar3 edges and Kael shadows first; do not bulk-clean the high-score list.
