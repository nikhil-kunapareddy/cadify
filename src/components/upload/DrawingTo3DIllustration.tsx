/**
 * Line illustration: an orthographic drawing sheet resolving into an
 * isometric part. Pure SVG, themed through CSS variables.
 */
export function DrawingTo3DIllustration({ className }: { className?: string }) {
  const ink = "var(--c-fg-subtle)";
  const faint = "var(--c-line-strong)";
  const accent = "var(--c-accent)";
  return (
    <svg viewBox="0 0 420 150" fill="none" className={className} aria-hidden role="presentation">
      {/* Drawing sheet */}
      <g>
        <rect x="14" y="14" width="150" height="112" rx="5" fill="var(--c-panel)" stroke={faint} />
        <rect x="22" y="22" width="134" height="96" rx="2" stroke={faint} strokeDasharray="2 2" />
        {/* title block */}
        <path d="M108 104h48M108 104v14M132 104v14" stroke={faint} />
        {/* front view */}
        <rect x="34" y="68" width="52" height="32" stroke={ink} strokeWidth="1.3" />
        <path d="M34 92h52" stroke={ink} strokeWidth="1.3" />
        <circle cx="60" cy="80" r="7" stroke={ink} strokeWidth="1.3" />
        <path d="M60 70v20M50 80h20" stroke={faint} strokeDasharray="4 1.5 1 1.5" />
        {/* top view */}
        <rect x="34" y="32" width="52" height="28" stroke={ink} strokeWidth="1.3" />
        <path d="M34 37h52" stroke={ink} strokeWidth="1.3" />
        <circle cx="42" cy="52" r="2.6" stroke={ink} />
        <circle cx="78" cy="52" r="2.6" stroke={ink} />
        <rect x="53" y="47.5" width="14" height="5" rx="2.5" stroke={ink} />
        {/* side view */}
        <path d="M96 100V68h6v24h20v8H96Z" stroke={ink} strokeWidth="1.3" />
        {/* dimensions */}
        <path d="M34 106h52" stroke={accent} strokeOpacity="0.7" />
        <path d="M34 103v6M86 103v6" stroke={accent} strokeOpacity="0.7" />
        <path d="M28 68v32" stroke={accent} strokeOpacity="0.7" />
        <path d="M25 68h6M25 100h6" stroke={accent} strokeOpacity="0.7" />
      </g>

      {/* Transformation path */}
      <g>
        <path d="M178 70h52" stroke={faint} strokeDasharray="3 4" strokeLinecap="round" />
        <path d="M226 64l8 6-8 6" stroke={ink} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="204" cy="70" r="13" fill="var(--c-app)" stroke={faint} />
        <path d="M204 63.5l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4-4.4-1.6 4.4-1.6 1.6-4.4Z" fill={accent} />
      </g>

      {/* Isometric part */}
      <g strokeLinejoin="round">
        {/* base top */}
        <path d="M262 92l58-30 74 38-58 30-74-38Z" fill={accent} fillOpacity="0.16" stroke={accent} strokeWidth="1.4" />
        {/* base front faces */}
        <path d="M262 92v10l74 38v-10l-74-38Z" fill={accent} fillOpacity="0.32" stroke={accent} strokeWidth="1.4" />
        <path d="M336 130v10l58-30v-10l-58 30Z" fill={accent} fillOpacity="0.24" stroke={accent} strokeWidth="1.4" />
        {/* upright wall */}
        <path d="M320 62V22l74 38v40l-74-38Z" fill={accent} fillOpacity="0.1" stroke={accent} strokeWidth="1.4" />
        <path d="M320 22l9-4.6 74 38-9 4.6" fill={accent} fillOpacity="0.22" stroke={accent} strokeWidth="1.4" />
        <path d="M403 55.4v40l-9 4.6" stroke={accent} strokeWidth="1.4" />
        {/* bore */}
        <ellipse cx="357" cy="54" rx="9" ry="11" transform="rotate(-27 357 54)" fill="var(--c-app)" stroke={accent} strokeWidth="1.4" />
        {/* holes and slot */}
        <ellipse cx="290" cy="94" rx="5" ry="2.8" transform="rotate(27 290 94)" stroke={accent} strokeWidth="1.2" />
        <ellipse cx="350" cy="124" rx="5" ry="2.8" transform="rotate(27 350 124)" stroke={accent} strokeWidth="1.2" />
        <path d="M315 101l14 7" stroke={accent} strokeWidth="5" strokeLinecap="round" strokeOpacity="0.45" />
      </g>
    </svg>
  );
}
