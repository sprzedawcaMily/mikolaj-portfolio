import { CONTACT_MESH_ANCHOR_ID } from '@/hooks/meshScrollEngine';
import { useMobileLayout } from '@/hooks/mobileLayout';
import { ContactSection } from './ContactSection';
import styles from './ContactZone.module.css';

/** Strefa kontaktu + slot strzałki mesha (poza kartą). */
export function ContactZone() {
  const isMobile = useMobileLayout();

  return (
    <div className={styles.zone}>
      {!isMobile && (
        <div
          id={CONTACT_MESH_ANCHOR_ID}
          className={styles.arrowSlot}
          aria-hidden="true"
        />
      )}
      <ContactSection />
    </div>
  );
}
