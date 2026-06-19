import { DotReveal } from '@/components/animation/DotReveal';
import { Button, Card, GitHubIcon, SectionHeading } from '@/components/emds';
import { profile } from '@/data/profile';
import { useLocale } from '@/context/LocaleProvider';
import { CONTACT_CTA_ANCHOR_ID } from '@/hooks/meshScrollEngine';
import styles from './ContactSection.module.css';

export function ContactSection() {
  const { t } = useLocale();

  return (
    <section className={styles.section} id="kontakt">
      <div className={styles.inner}>
        <DotReveal>
          <SectionHeading
            label={t.contact.label}
            title={t.contact.title}
            subtitle={t.contact.subtitle}
          />
        </DotReveal>
        <DotReveal delay={0.1}>
          <Card className={styles.contactCard}>
            <div className={styles.row}>
              <span className={styles.label}>{t.contact.email}</span>
              <a href={`mailto:${profile.email}`} className={styles.value}>
                {profile.email}
              </a>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>{t.contact.phone}</span>
              <a href={`tel:${profile.phone.replace(/\s/g, '')}`} className={styles.value}>
                {profile.phone}
              </a>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>{t.contact.github}</span>
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
              <span className={styles.label}>{t.contact.location}</span>
              <span className={styles.value}>{t.profile.location}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>{t.contact.workMode}</span>
              <span className={styles.value}>{t.profile.workMode}</span>
            </div>
            <div className={styles.actions}>
              <Button
                id={CONTACT_CTA_ANCHOR_ID}
                variant="primary"
                onClick={() => window.open(`mailto:${profile.email}`, '_self')}
              >
                {t.contact.ctaEmail}
              </Button>
              <a
                href={profile.github}
                className={styles.secondaryLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                <GitHubIcon size={16} />
                {t.contact.ctaGithub}
              </a>
            </div>
          </Card>
        </DotReveal>
      </div>
    </section>
  );
}
