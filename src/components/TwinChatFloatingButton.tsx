import { useEffect, useState } from 'react';
import { Sparkles, ArrowUpRight } from 'lucide-react';
import { hrefFor, navigateTo, type Route } from '@/lib/router';

interface TwinChatFloatingButtonProps {
  route: Route;
  signedIn: boolean;
}

/**
 * Bespoke Twin Emblem specifically designed for EchoSelf:
 * Two intersecting harmonic circles (The Human Self & The AI Twin)
 * bound at their epistemic nexus with a radiant 4-point golden star.
 */
function TwinEmblem({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Outer ambient glow */}
      <circle cx="16" cy="16" r="14" fill="url(#twin-glow)" opacity="0.4" />
      {/* Self circle */}
      <circle
        cx="12.5"
        cy="16"
        r="7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeOpacity="0.8"
      />
      {/* Twin circle */}
      <circle
        cx="19.5"
        cy="16"
        r="7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeDasharray="2.5 1.5"
        strokeOpacity="0.9"
      />
      {/* Epistemic Resonance Nexus - 4-pointed sparkle */}
      <path
        d="M16 10.5L16.9 14.2L20.5 16L16.9 17.8L16 21.5L15.1 17.8L11.5 16L15.1 14.2Z"
        fill="#F2E3C9"
      />
      {/* Mirrored micro constellations */}
      <circle cx="7" cy="10" r="1" fill="#D9A98F" />
      <circle cx="25" cy="22" r="1" fill="#D9A98F" />
      <defs>
        <radialGradient
          id="twin-glow"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(16 16) rotate(90) scale(14)"
        >
          <stop stopColor="#B87559" />
          <stop offset="1" stopColor="#B87559" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function TwinChatFloatingButton({
  route,
  signedIn,
}: TwinChatFloatingButtonProps) {
  const [hovered, setHovered] = useState(false);

  // Keyboard shortcut listener: Alt+T or Cmd/Ctrl+J to quickly consult Twin
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is actively typing in an input or textarea
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (isInput) return;

      if ((e.altKey && (e.key === 't' || e.key === 'T')) ||
          ((e.metaKey || e.ctrlKey) && (e.key === 'j' || e.key === 'J'))) {
        e.preventDefault();
        navigateTo('chat');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Hide when on the chat page itself, onboarding, or auth screens
  if (route.kind !== 'app') return null;
  if (route.page === 'chat' || route.page === 'onboarding') return null;

  const handleClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigateTo('chat');
  };

  return (
    <div
      className="fixed z-40 transition-all duration-300 pointer-events-auto"
      style={{
        // Desktop: bottom-7 right-7; Mobile: sits right above bottom dock (bottom-[74px] right-3.5)
      }}
    >
      {/* =========================================================================
          DESKTOP FLOATING PILL (hidden on mobile, flex on md+)
          Sculpted luxury capsule with twin aura, live status, and prompt peek
         ========================================================================= */}
      <div
        className="hidden md:block fixed bottom-7 right-7 group"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Ambient Breathing Aura */}
        <div
          aria-hidden="true"
          className="absolute -inset-1.5 rounded-full bg-gradient-to-r from-terracotta/25 via-amberclay-light/20 to-terracotta-dark/25 blur-md opacity-60 group-hover:opacity-100 transition-opacity duration-500 animate-pulse"
        />

        {/* Thought Whisper / Tooltip on Hover */}
        <div
          role="tooltip"
          className={`absolute bottom-full right-0 mb-3 pointer-events-none transition-all duration-200 transform ${
            hovered
              ? 'opacity-100 translate-y-0 scale-100'
              : 'opacity-0 translate-y-2 scale-95 pointer-events-none'
          }`}
        >
          <div className="bg-charcoal/95 text-paper border border-linen-dark/40 shadow-[0_12px_30px_rgba(32,35,33,0.35)] rounded-2xl p-3 w-64 backdrop-blur-xl">
            <div className="flex items-center justify-between text-[10px] text-terracotta-light uppercase tracking-wider font-semibold mb-1">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Epistemic Mirror
              </span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[9px] text-paper/80 border border-white/10">
                ⌥T
              </kbd>
            </div>
            <p className="text-xs text-paper/95 leading-snug font-serif">
              {signedIn
                ? '“What would I prioritize here based on my recorded values?”'
                : '“Ask Jordan’s twin how this decision balances ethics and ambition.”'}
            </p>
            <div className="mt-1.5 pt-1.5 border-t border-white/10 flex items-center justify-between text-[10px] text-paper/60">
              <span>Grounds answers in evidence</span>
              <span className="text-terracotta-light font-medium flex items-center gap-0.5">
                Consult Twin <ArrowUpRight className="w-3 h-3" />
              </span>
            </div>
          </div>
          {/* Subtle tooltip caret */}
          <div className="w-2.5 h-2.5 bg-charcoal/95 rotate-45 border-r border-b border-linen-dark/40 absolute -bottom-1.5 right-6" />
        </div>

        {/* Main Interactive Button Pill */}
        <a
          href={hrefFor('chat')}
          onClick={handleClick}
          aria-label="Open Twin Chat - Consult your epistemic AI mirror"
          className="relative flex items-center gap-3.5 pl-3 pr-4 py-2.5 rounded-full bg-gradient-to-r from-charcoal via-[#252825] to-charcoal text-paper border border-amberclay-light/35 shadow-[0_8px_24px_rgba(32,35,33,0.25),0_2px_8px_rgba(184,117,89,0.3)] hover:shadow-[0_14px_34px_rgba(32,35,33,0.35),0_4px_16px_rgba(184,117,89,0.5)] hover:border-terracotta-light/70 hover:-translate-y-0.5 active:translate-y-0 active:scale-98 transition-all duration-200 cursor-pointer select-none"
        >
          {/* Twin Insignia Icon Container with Live Presence Node */}
          <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-terracotta/30 to-amberclay/20 text-terracotta-light border border-terracotta/40 shadow-inner group-hover:scale-105 group-hover:text-amberclay-light transition-transform">
            <TwinEmblem className="w-6 h-6" />
            {/* Live Synchronized Presence Beacon */}
            <span
              className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5"
              title="Twin active & synchronized with evidence"
            >
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 border border-charcoal" />
            </span>
          </div>

          {/* Editorial Label & Subtitle */}
          <div className="flex flex-col text-left">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold tracking-wide text-paper group-hover:text-amberclay-light transition-colors">
                Twin Chat
              </span>
              <Sparkles className="w-3 h-3 text-terracotta-light group-hover:rotate-12 transition-transform" />
            </div>
            <span className="text-[10px] text-paper/70 font-serif italic tracking-normal">
              {signedIn ? 'Ask your second self' : 'Consult Jordan’s Echo'}
            </span>
          </div>

          {/* Keystroke Hint Capsule */}
          <div className="hidden lg:flex items-center ml-1 pl-2.5 border-l border-white/15 text-[10px] text-paper/60 font-mono">
            <span>⌥T</span>
          </div>
        </a>
      </div>

      {/* =========================================================================
          MOBILE FLOATING ACTION ORB (flex on < md, hidden on md+)
          Thumb-friendly floating jewel positioned cleanly above the bottom dock
         ========================================================================= */}
      <div className="md:hidden fixed bottom-[82px] sm:bottom-[86px] right-3.5 sm:right-5">
        {/* Ambient Ring Glow */}
        <div
          aria-hidden="true"
          className="absolute -inset-1 rounded-full bg-gradient-to-tr from-terracotta/40 via-amberclay/25 to-terracotta-deep/40 blur-xs animate-pulse opacity-70"
        />

        <a
          href={hrefFor('chat')}
          onClick={handleClick}
          aria-label="Open Twin Chat"
          className="relative flex items-center justify-center w-[50px] h-[50px] rounded-full bg-gradient-to-br from-charcoal via-[#232724] to-[#181B19] text-paper border border-amberclay-light/40 shadow-[0_8px_22px_rgba(32,35,33,0.32),0_2px_10px_rgba(184,117,89,0.38)] active:scale-92 transition-all duration-150 cursor-pointer"
        >
          {/* Bespoke Twin Emblem */}
          <TwinEmblem className="w-7 h-7 text-terracotta-light" />

          {/* Floating Miniature Sparkle Badge */}
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-terracotta text-paper shadow-xs border border-paper">
            <Sparkles className="w-2.5 h-2.5 text-paper" />
          </span>

          {/* Living Presence Dot */}
          <span className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-emerald-400 border border-charcoal shadow-2xs" />
        </a>
      </div>
    </div>
  );
}
