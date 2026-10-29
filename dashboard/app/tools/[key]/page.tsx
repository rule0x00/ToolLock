import { Suspense } from 'react';
import { Review } from '@/components/review';

export default function ReviewPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
      <Review />
    </Suspense>
  );
}
