import { OnboardingFlow } from '@/components/OnboardingFlow';
import { navigateTo } from '@/lib/router';
import { useAuth } from '@/lib/useAuth';

export function OnboardingPage() {
  const { user } = useAuth();

  const handleDismiss = () => {
    navigateTo('home');
  };

  return (
    <div className="min-h-[80vh] flex flex-col justify-center py-6 sm:py-12">
      <OnboardingFlow isModal={false} onDismiss={handleDismiss} />
    </div>
  );
}
