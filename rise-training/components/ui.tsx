'use client';

import Image from 'next/image';
import { ArrowRight, ClipboardList, Droplet, Dumbbell, House, MessageSquare } from 'lucide-react';
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ComponentPropsWithoutRef, type ReactNode } from 'react';

export const tabs = [
  { id: 'today', label: 'Today', icon: House },
  { id: 'train', label: 'Train', icon: Dumbbell },
  { id: 'habits', label: 'Habits', icon: Droplet },
  { id: 'check-ins', label: 'Check-in', icon: MessageSquare },
  { id: 'programme', label: 'Programme', icon: ClipboardList },
] as const;

export type Tab = typeof tabs[number]['id'];

export function PageGradient({ className = '', ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={`page-gradient ${className}`} {...props} />;
}

export function HeadingSentence({ lead, follow, className = '', id }: { lead: string; follow?: string; className?: string; id?: string }) {
  return <h1 id={id} className={`heading-sentence ${className}`}>{lead}{follow && <> <span>{follow}</span></>}</h1>;
}

export function RowStack({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`row-stack ${className}`}>{children}</div>;
}

type RowProps = {
  label: ReactNode;
  value?: ReactNode;
  end?: ReactNode;
  className?: string;
  onClick?: () => void;
  expanded?: boolean;
  controls?: string;
  current?: boolean;
};

export function Row({ label, value, end, className = '', onClick, expanded, controls, current }: RowProps) {
  const body = <><span className="row-copy"><span className="row-label">{label}</span>{value !== undefined && <span className="row-value">{value}</span>}</span>{end}</>;
  return onClick
    ? <button type="button" className={`row ${className}`} onClick={onClick} aria-expanded={expanded} aria-controls={controls} aria-current={current ? 'step' : undefined}>{body}</button>
    : <div className={`row ${className}`}>{body}</div>;
}

export function RoundButton({ className = '', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={`round-button ${className}`} {...props} />;
}

export function Pill({ className = '', onClick, href, children, disabled }: {
  className?: string; onClick?: () => void; href?: string; children: ReactNode; disabled?: boolean;
}) {
  const style = `pill ${className}`;
  if (href) return <a className={style} href={href}>{children}</a>;
  if (onClick) return <button type="button" className={style} onClick={onClick} disabled={disabled}>{children}</button>;
  return <span className={style}>{children}</span>;
}

export function PrimaryButton({ className = '', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={`primary-button ${className}`} {...props} />;
}

type ChipOption = { value: string; label: ReactNode; accessibleLabel?: string; disabled?: boolean };

export function ChipGroup({ label, value, options, onChange, className = '', disabled }: {
  label: string; value: string; options: ChipOption[]; onChange: (value: string) => void; className?: string; disabled?: boolean;
}) {
  const name = useId();
  return <div className={`chip-group ${className}`} role="radiogroup" aria-label={label}>
    {options.map((option) => <label className="chip" key={option.value}>
      <input type="radio" name={name} value={option.value} checked={option.value === value}
        aria-label={option.accessibleLabel} onChange={() => onChange(option.value)} disabled={disabled || option.disabled} />
      <span className="chip-face">{option.label}</span>
    </label>)}
  </div>;
}

export function FloatingNav({ tab, onNavigate }: { tab: Tab; onNavigate: (tab: Tab) => void }) {
  return <nav className="floating-nav" aria-label="Main navigation">
    {tabs.map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`} aria-label={label} aria-current={id === tab ? 'page' : undefined}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onNavigate(id);
      }}><Icon size={22} strokeWidth={1.7} aria-hidden="true" /></a>)}
  </nav>;
}

type SheetProps = { children: ReactNode; className?: string; labelId?: string; onClose?: () => void };

export function BottomSheet({ children, className = '', labelId, onClose }: SheetProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element || element.open) return;
    element.showModal();
    return () => element.close();
  }, []);
  if (!onClose) return <section className={`bottom-sheet ${className}`} aria-labelledby={labelId}>{children}</section>;
  return <dialog ref={dialog} className={`bottom-sheet modal-sheet ${className}`} aria-labelledby={labelId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="sheet-content"><span className="sheet-handle" aria-hidden="true" />{children}</div>
  </dialog>;
}

export function PhotoHero({ src, position, label, title, onClick }: {
  src: string; position?: string; label: string; title: string; onClick?: () => void;
}) {
  const body = <>
    <Image key={src} src={src} alt="" fill sizes="(max-width: 520px) 100vw, 480px" loading="eager" style={{ objectPosition: position }} />
    <span className="photo-scrim" aria-hidden="true" />
    <span className="photo-copy"><span>{label}</span><strong>{title}</strong></span>
    {onClick && <span className="round-button photo-arrow" aria-hidden="true"><ArrowRight size={20} strokeWidth={1.8} /></span>}
  </>;
  if (!onClick) return <div className="photo-hero">{body}</div>;
  return <button type="button" className="photo-hero" onClick={onClick}>{body}</button>;
}

export function NumberField({ label, value, onChange, decimal, disabled }: {
  label: string; value: string; onChange: (value: string) => void; decimal?: boolean; disabled?: boolean;
}) {
  const hint = useId();
  const field = useId();
  return <div className="number-field">
    <label htmlFor={field}>{label}</label>
    <input id={field} type="text" inputMode={decimal ? 'decimal' : 'numeric'} value={value} disabled={disabled}
      maxLength={12} aria-describedby={hint} onChange={(event) => onChange(event.target.value)} />
    <small id={hint}>Tap to type</small>
  </div>;
}

