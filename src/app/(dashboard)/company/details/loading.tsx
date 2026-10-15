import { SkeletonPageHeader } from '@/components/shared/page-skeletons'
import { SkeletonDetailCard } from '@/components/shared/page-skeletons'
export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />
      <SkeletonDetailCard sections={4} />
    </div>
  )
}
