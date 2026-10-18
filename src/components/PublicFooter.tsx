import { Feather, ExternalLink } from 'lucide-react';
import { hrefFor, navigateTo, type PageId } from '@/lib/router';

export function PublicFooter() {
  const currentYear = new Date().getFullYear();

  const handleNav = (target: PageId, anchorId?: string) => {
    if (anchorId) {
      const el = document.getElementById(anchorId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    navigateTo(target);
  };

  return (
    <footer className="w-full border-t border-linen-dark/60 bg-paper text-charcoal pt-10 pb-8 mt-12">
      <div className="max-w-6xl mx-auto shell-pad space-y-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-8 md:gap-12">
          {/* Brand & Ethos */}
          <div className="space-y-2 max-w-sm">
            <a
              href={hrefFor('home')}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="inline-flex items-center gap-2 group cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-terracotta/40 rounded-lg"
              aria-label="EchoSelf home"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-terracotta to-terracotta-dark text-paper shadow-2xs group-hover:scale-105 transition-transform">
                <Feather className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
              <span className="font-serif text-lg font-bold tracking-tight text-charcoal group-hover:text-terracotta transition-colors">
                EchoSelf
              </span>
            </a>
            <p className="font-serif italic text-xs text-charcoal-soft">
              &ldquo;Understand your experiences. Examine the evidence. Stay in control.&rdquo;
            </p>
            <p className="text-[11px] text-slateink leading-relaxed">
              An evidence-grounded personal AI twin. Isolated workspaces with Postgres Row-Level Security.
            </p>
          </div>

          {/* Streamlined, non-redundant link columns */}
          <div className="grid grid-cols-2 gap-8 sm:gap-14 text-xs">
            {/* Explore */}
            <div className="space-y-2.5">
              <h3 className="font-semibold uppercase tracking-wider text-charcoal text-[11px]">
                Explore
              </h3>
              <ul className="space-y-2 text-slateink">
                <li>
                  <button
                    type="button"
                    onClick={() => handleNav('home', 'how-it-works')}
                    className="hover:text-terracotta-deep transition-colors text-left cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-terracotta/40 rounded-xs"
                  >
                    How it works
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => handleNav('home', 'decision-mirror')}
                    className="hover:text-terracotta-deep transition-colors text-left cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-terracotta/40 rounded-xs"
                  >
                    Decision Mirror
                  </button>
                </li>
                <li>
                  <a
                    href={hrefFor('memories')}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      e.preventDefault();
                      handleNav('memories');
                    }}
                    className="hover:text-terracotta-deep transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-terracotta/40 rounded-xs"
                  >
                    Demo Persona (Jordan)
                  </a>
                </li>
                <li>
                  <a
                    href={hrefFor('graph')}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      e.preventDefault();
                      handleNav('graph');
                    }}
                    className="hover:text-terracotta-deep transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-terracotta/40 rounded-xs"
                  >
                    Evidence Graph
                  </a>
                </li>
              </ul>
            </div>

            {/* Workspace & Account */}
            <div className="space-y-2.5">
              <h3 className="font-semibold uppercase tracking-wider text-charcoal text-[11px]">
                Workspace
              </h3>
              <ul className="space-y-2 text-slateink">
                <li>
                  <a
                    href={hrefFor('chat')}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      e.preventDefault();
                      handleNav('chat');
                    }}
                    className="hover:text-terracotta-deep transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-terracotta/40 rounded-xs"
                  >
                    Twin Chat
                  </a>
                </li>
                <li>
                  <a
                    href={hrefFor('beliefs')}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      e.preventDefault();
                      handleNav('beliefs');
                    }}
                    className="hover:text-terracotta-deep transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-terracotta/40 rounded-xs"
                  >
                    Beliefs & Values
                  </a>
                </li>
                <li>
                  <a
                    href={hrefFor('settings')}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      e.preventDefault();
                      handleNav('settings');
                    }}
                    className="hover:text-terracotta-deep transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-terracotta/40 rounded-xs"
                  >
                    Settings & Privacy
                  </a>
                </li>
                <li>
                  <a
                    href={hrefFor('signin')}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      e.preventDefault();
                      handleNav('signin');
                    }}
                    className="hover:text-terracotta-deep transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-terracotta/40 rounded-xs"
                  >
                    Sign in
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom Legal & Attribution */}
        <div className="pt-5 border-t border-linen-dark/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slateink">
          <p>© {currentYear} EchoSelf · Evidence-grounded personal AI.</p>
          <a
            href="https://github.com/Yaldram81/Echo-Self"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-charcoal hover:underline transition-colors text-[11px] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-terracotta/40 rounded-xs"
          >
            <span>GitHub</span>
            <ExternalLink className="w-3 h-3 text-slateink-light" aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  );
}
