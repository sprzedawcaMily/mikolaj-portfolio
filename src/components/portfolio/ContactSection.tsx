import { DotReveal } from '@/components/animation/DotReveal';
import { Button, Card, GitHubIcon, SectionHeading } from '@/components/emds';
import { profile } from '@/data/profile';
import { CONTACT_CTA_ANCHOR_ID } from '@/hooks/meshScrollEngine';
import styles from './ContactSection.module.css';

export function ContactSection() {
  return (
    <section className={styles.section} id="kontakt">
      <div className={styles.inner}>
        <DotReveal>
          <SectionHeading
            label="Kontakt"
            title="Porozmawiajmy o współpracy"
            subtitle={profile.availability}
          />
        </DotReveal>
        <DotReveal delay={0.1}>
          <Card className={styles.contactCard}>
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
              <span className={styles.label}>GitHub</span>
              <a
                href={profile.github}
                className={styles.value}
                target="_blank"
                rel="noopener noreferrer"
              >
                github.com/{profile.githubHandle}
              </a>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>Lokalizacja</span>
              <span className={styles.value}>{profile.location}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>Forma pracy</span>
              <span className={styles.value}>{profile.workMode}</span>
            </div>
            <div className={styles.actions}>
              <Button
                id={CONTACT_CTA_ANCHOR_ID}
                variant="primary"
                onClick={() => window.open(`mailto:${profile.email}`, '_self')}
              >
                Napisz wiadomość
              </Button>
              <a
                href={profile.github}
                className={styles.secondaryLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                <GitHubIcon size={16} />
                Zobacz GitHub
              </a>
            </div>
          </Card>
        </DotReveal>
      </div>
    </section>
  );
}
