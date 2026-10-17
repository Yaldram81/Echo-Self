import { Feather } from 'lucide-react';
import { navigateTo } from '@/lib/router';

export function NotFoundPage() {
  return (
    <div className="max-w-xl mx-auto text-center py-16">
      <span className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-terracotta/10 text-terracotta-deep">
        <Feather className="w-6 h-6" aria-hidden />
      </span>
      <h1 className="font-serif text-3xl text-charcoal mb-3">Page not found</h1>
      <p className="text-sm text-slateink leading-relaxed mb-8">
        The address you followed doesn't match any page in EchoSelf. Records live in private
        workspaces, so there is nothing public to see at this URL.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={() => navigateTo('home')}
          className="inline-flex items-center justify-center rounded-full bg-terracotta px-5 py-2.5 text-sm font-medium text-paper hover:bg-terracotta-dark transition-colors"
        >
          Go to the overview
        </button>
        <a
          href="/signin"
          className="inline-flex items-center justify-center rounded-full border border-linen-dark px-5 py-2.5 text-sm font-medium text-slateink-dark hover:border-terracotta hover:text-terracotta-deep transition-colors"
        >
          Sign in
        </a>
      </div>
    </div>
  );
}
