import { DotReveal } from '@/components/animation/DotReveal';
import { Button, Card, SectionHeading } from '@/components/emds';
import { profile } from '@/data/profile';
import styles from './ContactSection.module.css';

export function ContactSection() {
  return (
    <section className={styles.section} id="kontakt">
      <div className={styles.inner}>
        <DotReveal>
          <SectionHeading
            label="Kontakt"
            title="Porozmawiajmy o współpracy"
            subtitle="Otwarty na projekty full-stack, mobile i architekturę z elementem AI."
          />
        </DotReveal>
        <DotReveal delay={0.1}>
          <Card className={styles.card}>
            <div className={styles.row}>
              <span className={styles.label}>Email</span>
              <a href={`mailto:${profile.email}`} className={styles.value}>
                {profile.email}
              </a>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>Telefon</span>
              <a href={`tel:${profile.phone.replace(/\s/g, '')}`} className={styles.value}>
                {profile.phone}
              </a>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>Lokalizacja</span>
              <span className={styles.value}>{profile.location}</span>
            </div>
            <div className={styles.actions}>
              <Button
                variant="primary"
                onClick={() => window.open(`mailto:${profile.email}`, '_self')}
              >
                Napisz wiadomość
              </Button>
            </div>
          </Card>
        </DotReveal>
      </div>
    </section>
  );
}
