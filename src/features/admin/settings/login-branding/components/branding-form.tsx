'use client'

import { useState, useEffect } from 'react'
import { useLoginBranding } from '../hooks/use-login-branding'
import { BrandingPreview } from './branding-preview'
import { ColorPicker } from './color-picker'
import { BrandingImageUpload } from './image-upload'
import type { LoginBrandingData } from '../schemas/login-branding.schema'
import type { DeferredFile } from '@/components/shared/ImageUploader'
import { uploadImage, BANNER_IMAGE_OPTIONS } from '@/lib/upload/image'
import { showToast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Save, Eye } from 'lucide-react'

const DEFAULT_DATA: LoginBrandingData = {
  appName: 'PerksGo',
  tagline: '',
  heading: 'Sign in',
  description: 'Sign in to continue to your dashboard.',
  logoUrl: null,
  bannerUrl: null,
  backgroundImageUrl: null,
  primaryColor: '#4F46E5',
  secondaryColor: '#7C3AED',
  accentColor: '#06B6D4',
  textColor: '#1E293B',
  cardBackground: '#ffffff',
  layout: 'SPLIT_CARD',
  showLogo: true,
  showHeading: true,
  showDescription: true,
  showBanner: true,
  showFooter: true,
  footerTitle: '',
  footerDescription: '',
  copyright: '',
}

export function BrandingForm() {
  const { branding, isLoading, saveBranding, isSaving } = useLoginBranding()
  const [formData, setFormData] = useState<LoginBrandingData>(DEFAULT_DATA)
  const [showPreview, setShowPreview] = useState(true)
  const [pendingLogoFile, setPendingLogoFile] = useState<DeferredFile | null>(null)
  const [pendingBgFile, setPendingBgFile] = useState<DeferredFile | null>(null)

  useEffect(() => {
    console.log('Branding data from useLoginBranding hook:', branding?.backgroundImageUrl, branding?.logoUrl, branding?.bannerUrl)
    if (branding) {
      setFormData({
        appName: branding.appName ?? DEFAULT_DATA.appName,
        tagline: branding.tagline ?? DEFAULT_DATA.tagline,
        heading: branding.heading ?? DEFAULT_DATA.heading,
        description: branding.description ?? DEFAULT_DATA.description,
        logoUrl: branding.logoUrl ?? null,
        bannerUrl: branding.bannerUrl ?? null,
        backgroundImageUrl: branding.backgroundImageUrl ?? null,
        primaryColor: branding.primaryColor ?? DEFAULT_DATA.primaryColor,
        secondaryColor: branding.secondaryColor ?? DEFAULT_DATA.secondaryColor,
        accentColor: branding.accentColor ?? DEFAULT_DATA.accentColor,
        textColor: branding.textColor ?? DEFAULT_DATA.textColor,
        cardBackground: branding.cardBackground ?? DEFAULT_DATA.cardBackground,
        layout: branding.layout ?? 'SPLIT_CARD',
        showLogo: branding.showLogo ?? true,
        showHeading: branding.showHeading ?? true,
        showDescription: branding.showDescription ?? true,
        showBanner: branding.showBanner ?? true,
        showFooter: branding.showFooter ?? true,
        footerTitle: branding.footerTitle ?? '',
        footerDescription: branding.footerDescription ?? '',
        copyright: branding.copyright ?? '',
      })
    }
  }, [branding])

  const updateField = <K extends keyof LoginBrandingData>(key: K, value: LoginBrandingData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    const payload = { ...formData }
    // Upload pending files before saving
    if (pendingLogoFile) {
      try {
        payload.logoUrl = await uploadImage(pendingLogoFile.file, BANNER_IMAGE_OPTIONS)
        setPendingLogoFile(null)
      } catch (err: any) {
        showToast({ type: 'error', title: 'Logo upload failed', description: err?.message })
        return
      }
    }
    if (pendingBgFile) {
      try {
        payload.backgroundImageUrl = await uploadImage(pendingBgFile.file, BANNER_IMAGE_OPTIONS)
        setPendingBgFile(null)
      } catch (err: any) {
        showToast({ type: 'error', title: 'Background upload failed', description: err?.message })
        return
      }
    }
    await saveBranding(payload)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Login Branding" description="Customize the login page appearance" />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Settings form */}
        <div className="space-y-6">
          {/* Branding */}
          <Card>
            <CardHeader>
              <CardTitle>Branding</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Application Name</label>
                <Input
                  value={formData.appName ?? ''}
                  onChange={(e) => updateField('appName', e.target.value)}
                  placeholder="My App"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Tagline</label>
                <Input
                  value={formData.tagline ?? ''}
                  onChange={(e) => updateField('tagline', e.target.value)}
                  placeholder="A short tagline"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Welcome Heading</label>
                <Input
                  value={formData.heading ?? ''}
                  onChange={(e) => updateField('heading', e.target.value)}
                  placeholder="Sign in"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Welcome Description</label>
                <textarea
                  value={formData.description ?? ''}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="Sign in to continue to your dashboard."
                  rows={2}
                  className="flex h-auto w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
            </CardContent>
          </Card>

          {/* Images */}
          <Card>
            <CardHeader>
              <CardTitle>Images</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <BrandingImageUpload
                label="Logo"
                hint="Recommended: 200x200px"
                value={formData.logoUrl}
                onChange={(url) => updateField('logoUrl', url)}
                onDeferredFile={(file) => setPendingLogoFile(file)}
              />
              {/* <BrandingImageUpload
                label="Banner / Hero Image"
                hint="Recommended: 600x300px"
                value={formData.bannerUrl}
                onChange={(url) => updateField('bannerUrl', url)}
              /> */}
              <BrandingImageUpload
                label="Background Image"
                hint="Full-screen background image"
                value={formData.backgroundImageUrl}
                onChange={(url) => updateField('backgroundImageUrl', url)}
                onDeferredFile={(file) => setPendingBgFile(file)}
              />
            </CardContent>
          </Card>

          {/* Colors */}
          <Card>
            <CardHeader>
              <CardTitle>Theme Colors</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <ColorPicker label="Primary Color" value={formData.primaryColor ?? ''} onChange={(v) => updateField('primaryColor', v)} />
              <ColorPicker label="Secondary Color" value={formData.secondaryColor ?? ''} onChange={(v) => updateField('secondaryColor', v)} />
              <ColorPicker label="Accent Color" value={formData.accentColor ?? ''} onChange={(v) => updateField('accentColor', v)} />
              <ColorPicker label="Text Color" value={formData.textColor ?? ''} onChange={(v) => updateField('textColor', v)} />
              <ColorPicker label="Card Background" value={formData.cardBackground ?? ''} onChange={(v) => updateField('cardBackground', v)} />
            </CardContent>
          </Card>

          {/* Layout */}
          <Card>
            <CardHeader>
              <CardTitle>Layout</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <label className="text-sm font-medium">Layout Style</label>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { value: 'SPLIT_CARD', label: 'Split Card', desc: 'Branding and login side by side' },
                    { value: 'CENTER_CARD', label: 'Center Card', desc: 'Branding centered above login card' },
                    { value: 'FULLSCREEN_HERO', label: 'Fullscreen Hero', desc: 'Full background image with floating login' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateField('layout', option.value)}
                      className={`flex flex-col items-start rounded-lg border p-3 text-left transition-colors ${
                        (formData.layout ?? 'SPLIT_CARD') === option.value
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-input hover:border-primary/50'
                      }`}
                    >
                      <span className="text-sm font-medium">{option.label}</span>
                      <span className="text-xs text-muted-foreground">{option.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Visibility */}
          <Card>
            <CardHeader>
              <CardTitle>Visibility</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Show Logo</label>
                <input
                  type="checkbox"
                  checked={formData.showLogo ?? true}
                  onChange={(e) => updateField('showLogo', e.target.checked)}
                  className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Show Heading</label>
                <input
                  type="checkbox"
                  checked={formData.showHeading ?? true}
                  onChange={(e) => updateField('showHeading', e.target.checked)}
                  className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Show Description</label>
                <input
                  type="checkbox"
                  checked={formData.showDescription ?? true}
                  onChange={(e) => updateField('showDescription', e.target.checked)}
                  className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Show Hero Banner</label>
                <input
                  type="checkbox"
                  checked={formData.showBanner ?? true}
                  onChange={(e) => updateField('showBanner', e.target.checked)}
                  className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Show Footer Text</label>
                <input
                  type="checkbox"
                  checked={formData.showFooter ?? true}
                  onChange={(e) => updateField('showFooter', e.target.checked)}
                  className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
                />
              </div>
            </CardContent>
          </Card>

          {/* Footer */}
          <Card>
            <CardHeader>
              <CardTitle>Footer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Footer Title</label>
                <Input
                  value={formData.footerTitle ?? ''}
                  onChange={(e) => updateField('footerTitle', e.target.value)}
                  placeholder="About our platform"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Footer Description</label>
                <textarea
                  value={formData.footerDescription ?? ''}
                  onChange={(e) => updateField('footerDescription', e.target.value)}
                  placeholder="A short footer description"
                  rows={2}
                  className="flex h-auto w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Copyright Text</label>
                <Input
                  value={formData.copyright ?? ''}
                  onChange={(e) => updateField('copyright', e.target.value)}
                  placeholder="© 2026 My Company"
                />
              </div>
            </CardContent>
          </Card>

          {/* Save */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </div>

        {/* Live preview */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Live Preview</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
              {showPreview ? 'Hide' : 'Show'}
            </Button>
          </div>
          {showPreview && (
            <div className="sticky top-6">
              <BrandingPreview data={formData} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
