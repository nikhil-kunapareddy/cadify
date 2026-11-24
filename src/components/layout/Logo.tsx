export function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect width="24" height="24" rx="6" fill="var(--c-accent)" />
      <path d="M12 5.2 18 8.7v6.6L12 18.8l-6-3.5V8.7l6-3.5Z" fill="white" fillOpacity="0.16" />
      <path d="M6 8.7 12 12.2l6-3.5M12 12.2v6.6" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 5.2 18 8.7v6.6L12 18.8l-6-3.5V8.7l6-3.5Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 12.2 18 8.7v6.6l-6 3.5v-6.6Z" fill="white" fillOpacity="0.28" />
    </svg>
  );
}
