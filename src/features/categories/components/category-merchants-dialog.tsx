'use client'
import Link from 'next/link'
import { Store } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdminCategory } from '@/hooks/queries/use-admin-categories'
import type { AdminCategoryRow } from '../types'

export function CategoryMerchantsDialog({ category, onClose }: { category: AdminCategoryRow; onClose: () => void }) {
  const { data, isLoading, isError, error } = useAdminCategory(category.id)
  const merchants = data?.merchants ?? []

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{category.name}</DialogTitle>
          <DialogDescription>
            {category.merchantCount} linked merchant{category.merchantCount === 1 ? '' : 's'}
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-6 max-h-[60dvh] overflow-y-auto px-6">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : isError ? (
            <p className="py-6 text-center text-sm text-destructive">{(error as Error).message}</p>
          ) : merchants.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <Store className="mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No merchants in this category</p>
            </div>
          ) : (
            <ul className="divide-y">
              {merchants.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <Avatar className="h-9 w-9">
                    {m.logoUrl ? <AvatarImage src={m.logoUrl} alt="" /> : null}
                    <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white">
                      {m.businessName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <Link
                    href={`/admin/merchants/${m.id}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary hover:underline"
                  >
                    {m.businessName}
                  </Link>
                  {m.deleted ? (
                    <Badge variant="suspended" className="text-[10px]">Deleted</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] capitalize">{m.status.toLowerCase()}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
