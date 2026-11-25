import { ExternalLink } from 'lucide-react';

const WEEKLY_CHECK_IN_FORM =
  'https://docs.google.com/forms/d/e/1FAIpQLSfzcPc2bXNiWx1JJUmlrJhLPre4cYgqmi2XRLZCekctKDuckg/viewform?pli=1';

export function WeeklyCheckInLink() {
  return <a className="primary-button button-quiet" href={WEEKLY_CHECK_IN_FORM} target="_blank" rel="noopener noreferrer">
    Weekly check-in <ExternalLink size={16} aria-hidden="true" />
  </a>;
}
