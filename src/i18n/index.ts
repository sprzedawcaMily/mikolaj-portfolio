import { projects as baseProjects } from '@/data/projects';
import { experience as baseExperience } from '@/data/experience';
import { education as baseEducation } from '@/data/education';
import { skillGroups as baseSkillGroups } from '@/data/skills';
import type { Locale, ProjectId, Translations } from '@/i18n/types';
import { en } from '@/i18n/en';
import { pl } from '@/i18n/pl';

export type { Locale, Translations };

const catalogs: Record<Locale, Translations> = { pl, en };

export function getTranslations(locale: Locale): Translations {
  return catalogs[locale];
}

export function getLocalizedProjects(locale: Locale) {
  const t = catalogs[locale].projects.items;
  return baseProjects.map((p) => {
    const copy = t[p.id as ProjectId];
    return {
      ...p,
      name: copy.name,
      tagline: copy.tagline,
      description: copy.description,
      role: copy.role,
      infrastructure: copy.infrastructure,
      features: copy.features,
      screenshots: p.screenshots.map((shot, i) => ({
        ...shot,
        alt: copy.screenshots[i]?.alt ?? shot.alt,
        caption: copy.screenshots[i]?.caption,
      })),
    };
  });
}

export function getLocalizedExperience(locale: Locale) {
  const t = catalogs[locale].experience.items;
  return baseExperience.map((item) => {
    const copy = t[item.id];
    return copy
      ? { ...item, role: copy.role, period: copy.period, highlights: copy.highlights }
      : item;
  });
}

export function getLocalizedEducation(locale: Locale) {
  const t = catalogs[locale].experience.education;
  return baseEducation.map((item) => {
    const copy = t[item.id];
    return copy
      ? {
          ...item,
          school: copy.school,
          degree: copy.degree,
          period: copy.period,
          form: copy.form,
          highlights: copy.highlights,
        }
      : item;
  });
}

export function getLocalizedSkillGroups(locale: Locale) {
  const t = catalogs[locale].skills.groups;
  return baseSkillGroups.map((group) => ({
    ...group,
    label: t[group.id]?.label ?? group.label,
  }));
}
