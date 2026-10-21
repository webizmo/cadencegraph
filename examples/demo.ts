import type { Layout, MotionNode, Project } from '../src/core/types';

const text = (en: string, tr: string) => ({ en, tr });
function node(id: string, type: MotionNode['type'], role: string, sentenceId: string, content: { en: string; tr: string }, layout: Layout, portrait: Layout, extra: Partial<MotionNode> = {}): MotionNode {
  return { id, type, role, content, layout, overrides: { '9:16': { layout: portrait, protected: false } }, timing: { sentenceId }, animation: { enter: 'rise' }, ...extra };
}

/** Original sample project; every element remains addressable by a stable ID. */
export const demoProject: Project = {
  schemaVersion: 1,
  id: 'cadencegraph-demo',
  name: 'A little more possible',
  revision: 0,
  locales: ['en', 'tr'],
  ratios: ['16:9', '9:16'],
  fps: 24,
  brand: { name: 'CadenceGraph', accent: '#c7f36c', background: '#f3f1e7', foreground: '#14291f', fontFamily: 'Manrope' },
  assets: [{ id: 'orbit-mark', type: 'image', src: 'assets/orbit-mark.svg', name: 'Original CadenceGraph orbit mark', license: 'Apache-2.0' }],
  scenes: [
    {
      id: 'scene-intro', name: 'A little more possible', kind: 'intro', theme: 'inverted',
      sentences: [{ id: 'sentence-intro', text: text('Every good idea deserves room to move. Meet CadenceGraph.', 'Her iyi fikir, hareket edecek bir alanı hak eder. CadenceGraph ile tanışın.'), duration: { en: 6.5, tr: 7.5 } }],
      nodes: [
        node('intro-eyebrow', 'text', 'eyebrow', 'sentence-intro', text('AN OPEN MOTION STUDIO', 'AÇIK KAYNAK HAREKET STÜDYOSU'), { x: 7, y: 17, width: 42, height: 4 }, { x: 9, y: 12, width: 82, height: 3 }, { style: { fontSize: 23, fontWeight: 600 } }),
        node('intro-headline', 'text', 'headline', 'sentence-intro', text('A little more\npossible.', 'Her revizyonla\ndaha mümkün.'), { x: 7, y: 26, width: 47, height: 30 }, { x: 9, y: 18, width: 82, height: 19 }, { style: { fontSize: 112, fontWeight: 600 }, animation: { enter: 'rise', delay: 0.12 } }),
        node('intro-deck', 'text', 'deck', 'sentence-intro', text('Ideas move. Your design decisions stay.', 'Fikirler hareket eder. Tasarım kararların kalır.'), { x: 7, y: 65, width: 40, height: 10 }, { x: 9, y: 38, width: 80, height: 6 }, { style: { fontSize: 32, fontWeight: 400 }, animation: { enter: 'rise', delay: 0.28 } }),
        node('intro-orbit', 'component', 'hero-visual', 'sentence-intro', text('', ''), { x: 53, y: 16, width: 43, height: 66 }, { x: 8, y: 46, width: 84, height: 38 }, { component: 'signal-orbit', animation: { enter: 'scale', delay: 0.1 }, props: { label: 'Living project' } }),
        node('intro-logo', 'media', 'brand-mark', 'sentence-intro', text('', ''), { x: 7, y: 5.3, width: 2.7, height: 4.8 }, { x: 9, y: 5.5, width: 5, height: 2.8 }, { assetId: 'orbit-mark', animation: { enter: 'fade' } }),
        node('intro-caption', 'caption', 'caption', 'sentence-intro', text('Every good idea deserves room to move.', 'Her iyi fikir, hareket edecek bir alanı hak eder.'), { x: 8, y: 92, width: 84, height: 4.5 }, { x: 8, y: 92, width: 84, height: 4 }, { style: { fontSize: 27, align: 'center' }, animation: { enter: 'fade', delay: 0.3 } }),
      ],
    },
    {
      id: 'scene-features', name: 'Change without losing the craft', kind: 'features',
      sentences: [{ id: 'sentence-features', text: text('Change the language. Extend the narration. Your timing follows, and your hand-tuned layouts stay protected.', 'Dili değiştir. Anlatımı uzat. Zamanlama birlikte güncellenir, elle yaptığın yerleşimler korunur.'), duration: { en: 7, tr: 8 } }],
      nodes: [
        node('features-eyebrow', 'text', 'eyebrow', 'sentence-features', text('CONNECTED BY DESIGN', 'TASARIMIYLA BİRBİRİNE BAĞLI'), { x: 7, y: 12, width: 44, height: 4 }, { x: 9, y: 9, width: 82, height: 3 }, { style: { fontSize: 23, fontWeight: 600 } }),
        node('features-headline', 'text', 'headline', 'sentence-features', text('Change the story.\nKeep the craft.', 'Hikâyeyi değiştir.\nEmeğini koru.'), { x: 7, y: 22, width: 45, height: 25 }, { x: 9, y: 16, width: 82, height: 18 }, { style: { fontSize: 88, fontWeight: 600 }, animation: { enter: 'rise', delay: 0.08 } }),
        node('features-deck', 'text', 'deck', 'sentence-features', text('Human hands. Agent speed.\nOne editable project.', 'İnsan dokunuşu. Ajan hızı.\nTek düzenlenebilir proje.'), { x: 7, y: 53, width: 42, height: 11 }, { x: 9, y: 35, width: 82, height: 7 }, { style: { fontSize: 30 }, animation: { enter: 'rise', delay: 0.2 } }),
        node('features-board', 'component', 'revision-visual', 'sentence-features', text('', ''), { x: 54, y: 13, width: 40, height: 57 }, { x: 8, y: 44, width: 84, height: 28 }, { component: 'revision-board', props: { label: 'Manual position preserved', before: 'EN · 6.5s', after: 'TR · 7.5s' }, animation: { enter: 'scale', delay: 0.16 } }),
        node('feature-timing', 'card', 'feature-card', 'sentence-features', text('Timing that follows meaning', 'Anlama bağlı zamanlama'), { x: 7, y: 76, width: 40, height: 11 }, { x: 9, y: 75, width: 82, height: 6 }, { props: { icon: 'clock', label: 'SENTENCE-LINKED', metric: '01' }, animation: { enter: 'slide', delay: 0.4 } }),
        node('feature-protection', 'card', 'feature-card', 'sentence-features', text('Your layout, protected', 'Yerleşimin güvence altında'), { x: 52, y: 76, width: 40, height: 11 }, { x: 9, y: 83, width: 82, height: 6 }, { props: { icon: 'anchor', label: 'HUMAN-IN-CONTROL', metric: '02' }, animation: { enter: 'slide', delay: 0.55 } }),
        node('features-caption', 'caption', 'caption', 'sentence-features', text('Revise together. Keep every deliberate detail.', 'Birlikte düzenle. Verdiğin her kararı koru.'), { x: 8, y: 92, width: 84, height: 4.5 }, { x: 8, y: 93, width: 84, height: 3.5 }, { style: { fontSize: 27, align: 'center' }, animation: { enter: 'fade', delay: 0.25 } }),
      ],
    },
    {
      id: 'scene-outro', name: 'One source, every version', kind: 'outro',
      sentences: [{ id: 'sentence-outro', text: text('Two languages. Two formats. One living source. Make something worth moving.', 'İki dil. İki format. Yaşayan tek kaynak. Harekete değer bir şey üret.'), duration: { en: 6, tr: 6.5 } }],
      nodes: [
        node('outro-eyebrow', 'text', 'eyebrow', 'sentence-outro', text('DESIGNED TO KEEP MOVING', 'HAREKETE DEVAM ETMEK İÇİN'), { x: 7, y: 16, width: 44, height: 4 }, { x: 9, y: 10, width: 82, height: 3 }, { style: { fontSize: 23, fontWeight: 600 } }),
        node('outro-headline', 'text', 'headline', 'sentence-outro', text('One source.\nEvery version.', 'Tek kaynak.\nHer sürüm.'), { x: 7, y: 27, width: 44, height: 28 }, { x: 9, y: 17, width: 82, height: 18 }, { style: { fontSize: 104, fontWeight: 600 }, animation: { enter: 'rise', delay: 0.12 } }),
        node('outro-variants', 'component', 'variant-visual', 'sentence-outro', text('', ''), { x: 53, y: 17, width: 42, height: 62 }, { x: 8, y: 40, width: 84, height: 33 }, { component: 'variant-fan', props: { locales: ['EN', 'TR'] }, animation: { enter: 'scale', delay: 0.12 } }),
        node('outro-deck', 'text', 'deck', 'sentence-outro', text('Open source. Local first.\nMade for your next revision.', 'Açık kaynak. Yerel çalışma.\nBir sonraki revizyonun için.'), { x: 7, y: 60, width: 42, height: 10 }, { x: 9, y: 77, width: 82, height: 7 }, { style: { fontSize: 30 }, animation: { enter: 'rise', delay: 0.28 } }),
        node('outro-cta', 'cta', 'cta', 'sentence-outro', text('Make it move', 'Harekete geçir'), { x: 7, y: 76, width: 31, height: 9 }, { x: 9, y: 86, width: 60, height: 5 }, { style: { fontSize: 31, fontWeight: 600 }, animation: { enter: 'rise', delay: 0.5 } }),
        node('outro-caption', 'caption', 'caption', 'sentence-outro', text('Two languages. Two formats. One living source.', 'İki dil. İki format. Yaşayan tek kaynak.'), { x: 8, y: 93, width: 84, height: 4 }, { x: 8, y: 94, width: 84, height: 3 }, { style: { fontSize: 27, align: 'center' }, animation: { enter: 'fade', delay: 0.3 } }),
      ],
    },
  ],
};

export default demoProject;
