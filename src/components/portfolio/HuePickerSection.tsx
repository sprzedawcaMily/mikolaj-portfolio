import { DotReveal } from '@/components/animation/DotReveal';
import { HuePickerBar } from '@/components/layout/HuePickerBar';
import { Card, SectionHeading } from '@/components/emds';
import styles from './HuePickerSection.module.css';

export function HuePickerSection() {
  return (
    <section className={styles.section} id="studio-palety">
      <div className={styles.inner}>
        <DotReveal>
          <SectionHeading
            label="Komponent natywny"
            title="Studio palety"
            subtitle="Przeciągnij suwak — jeden kolor generuje spójny motyw dla całej strony, w tym włosów w portrecie."
          />
        </DotReveal>

        <DotReveal delay={0.08}>
          <Card className={styles.card}>
            <HuePickerBar />
          </Card>
        </DotReveal>
      </div>
    </section>
  );
}
