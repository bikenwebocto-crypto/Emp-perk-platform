'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { showToast } from '@/hooks/use-toast'
import { Save, RotateCcw } from 'lucide-react'

interface ThemeSettings {
  sidebarBg: string
  sidebarBgOpacity: number
  sidebarText: string
  sidebarTextMuted: string
  sidebarActiveBg: string
  sidebarActiveText: string
  sidebarHoverBg: string
  sidebarHoverText: string
  sidebarBorder: string
  sidebarBadgeBg: string
  sidebarBadgeText: string
  navbarBg: string
  navbarBgOpacity: number
  navbarText: string
  navbarBorder: string
  navbarDropdownBg: string
  liveIndicatorBg: string
  liveIndicatorText: string
  liveDotColor: string
  overlayBg: string
}

interface Theme {
  id: string
  name: string
  slug: string
  isActive: boolean
  settings: ThemeSettings
}

const DEFAULT_SETTINGS: ThemeSettings = {
  sidebarBg: '0 0% 100%',
  sidebarBgOpacity: 1,
  sidebarText: '222.2 84% 4.9%',
  sidebarTextMuted: '215.4 16.3% 46.9%',
  sidebarActiveBg: '221.2 83.2% 53.3%',
  sidebarActiveText: '221.2 83.2% 53.3%',
  sidebarHoverBg: '210 40% 96.1%',
  sidebarHoverText: '222.2 84% 4.9%',
  sidebarBorder: '214.3 31.8% 91.4%',
  sidebarBadgeBg: '221.2 83.2% 53.3%',
  sidebarBadgeText: '210 40% 98%',
  navbarBg: '0 0% 100%',
  navbarBgOpacity: 1,
  navbarText: '222.2 84% 4.9%',
  navbarBorder: '214.3 31.8% 91.4%',
  navbarDropdownBg: '0 0% 100%',
  liveIndicatorBg: '142 76% 94%',
  liveIndicatorText: '142 72% 29%',
  liveDotColor: '142 71% 45%',
  overlayBg: '0 0% 0%',
}

function hslToHex(hsl: string): string {
  if (!hsl) return '#000000'

  const match = hsl.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/)
  if (!match || !match[1] || !match[2] || !match[3]) return '#000000'
  const h = parseFloat(match[1]) / 360
  const s = parseFloat(match[2]) / 100
  const l = parseFloat(match[3]) / 100

  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h * 6) % 2 - 1))
  const m = l - c / 2

  let r = 0, g = 0, b = 0
  if (h < 1/6) { r = c; g = x; b = 0 }
  else if (h < 2/6) { r = x; g = c; b = 0 }
  else if (h < 3/6) { r = 0; g = c; b = x }
  else if (h < 4/6) { r = 0; g = x; b = c }
  else if (h < 5/6) { r = x; g = 0; b = c }
  else { r = c; g = 0; b = x }

  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function hexToHsl(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result || !result[1] || !result[2] || !result[3]) return '0 0% 0%'
  const r = parseInt(result[1], 16) / 255
  const g = parseInt(result[2], 16) / 255
  const b = parseInt(result[3], 16) / 255

  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const hex = hslToHex(value)
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(hexToHsl(e.target.value))}
          className="h-8 w-8 cursor-pointer rounded border-0 p-0"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-xs font-mono"
        />
      </div>
    </div>
  )
}

function OpacityField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1"
        />
        <span className="text-xs text-muted-foreground w-8 text-right">{Math.round(value * 100)}%</span>
      </div>
    </div>
  )
}

export default function ThemeCustomizerPage() {
  const queryClient = useQueryClient()
  const [selectedSlug, setSelectedSlug] = useState<string>('default')
  const [settings, setSettings] = useState<ThemeSettings>(DEFAULT_SETTINGS)
  const [activeTab, setActiveTab] = useState<'sidebar' | 'navbar' | 'misc'>('sidebar')

  const { data: themes = [] } = useQuery<Theme[]>({
    queryKey: ['admin', 'themes'],
    queryFn: async () => {
      const res = await fetch('/api/admin/themes')
      if (!res.ok) throw new Error('Failed to fetch themes')
      return res.json()
    },
  })

  const selectedTheme = themes.find((t) => t.slug === selectedSlug)

  useEffect(() => {
    if (selectedTheme) {
      setSettings({ ...DEFAULT_SETTINGS, ...selectedTheme.settings })
    }
  }, [selectedTheme])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/themes/${selectedSlug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error('Failed to save theme')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'themes'] })
      showToast({ type: 'success', title: 'Theme settings saved' })
    },
    onError: () => showToast({ type: 'error', title: 'Failed to save theme' }),
  })

  const activateMutation = useMutation({
    mutationFn: async (slug: string) => {
      const res = await fetch(`/api/admin/themes/${slug}/activate`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to activate theme')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'themes'] })
      showToast({ type: 'success', title: 'Theme activated' })
    },
    onError: () => showToast({ type: 'error', title: 'Failed to activate theme' }),
  })

  const updateSetting = useCallback(<K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }, [])

  const resetToDefaults = useCallback(() => {
    setSettings(DEFAULT_SETTINGS)
    showToast({ type: 'info', title: 'Reset to defaults (save to apply)' })
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader title="Theme Customizer" description="Customize the look and feel of the admin panel" />

      <div className="flex items-center gap-2">
        {themes.map((theme) => (
          <Button
            key={theme.slug}
            variant={selectedSlug === theme.slug ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedSlug(theme.slug)}
          >
            {theme.name}
            {theme.isActive && <Badge className="ml-2" variant="secondary">Active</Badge>}
          </Button>
        ))}
        <Button
          size="sm"
          variant="outline"
          onClick={() => activateMutation.mutate(selectedSlug)}
          disabled={selectedTheme?.isActive || activateMutation.isPending}
        >
          Activate
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex gap-2 border-b pb-2">
            {(['sidebar', 'navbar', 'misc'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === tab
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {activeTab === 'sidebar' && (
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">Background</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <ColorField label="Background Color" value={settings.sidebarBg} onChange={(v) => updateSetting('sidebarBg', v)} />
                  <OpacityField label="Background Opacity" value={settings.sidebarBgOpacity} onChange={(v) => updateSetting('sidebarBgOpacity', v)} />
                  <ColorField label="Border Color" value={settings.sidebarBorder} onChange={(v) => updateSetting('sidebarBorder', v)} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">Text</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <ColorField label="Text Color" value={settings.sidebarText} onChange={(v) => updateSetting('sidebarText', v)} />
                  <ColorField label="Muted Text Color" value={settings.sidebarTextMuted} onChange={(v) => updateSetting('sidebarTextMuted', v)} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">Active Item</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <ColorField label="Background Color" value={settings.sidebarActiveBg} onChange={(v) => updateSetting('sidebarActiveBg', v)} />
                  <ColorField label="Text Color" value={settings.sidebarActiveText} onChange={(v) => updateSetting('sidebarActiveText', v)} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">Hover</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <ColorField label="Background Color" value={settings.sidebarHoverBg} onChange={(v) => updateSetting('sidebarHoverBg', v)} />
                  <ColorField label="Text Color" value={settings.sidebarHoverText} onChange={(v) => updateSetting('sidebarHoverText', v)} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">Badge</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <ColorField label="Background Color" value={settings.sidebarBadgeBg} onChange={(v) => updateSetting('sidebarBadgeBg', v)} />
                  <ColorField label="Text Color" value={settings.sidebarBadgeText} onChange={(v) => updateSetting('sidebarBadgeText', v)} />
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'navbar' && (
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">Background</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <ColorField label="Background Color" value={settings.navbarBg} onChange={(v) => updateSetting('navbarBg', v)} />
                  <OpacityField label="Background Opacity" value={settings.navbarBgOpacity} onChange={(v) => updateSetting('navbarBgOpacity', v)} />
                  <ColorField label="Border Color" value={settings.navbarBorder} onChange={(v) => updateSetting('navbarBorder', v)} />
                  <ColorField label="Dropdown Background" value={settings.navbarDropdownBg} onChange={(v) => updateSetting('navbarDropdownBg', v)} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">Text</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <ColorField label="Text Color" value={settings.navbarText} onChange={(v) => updateSetting('navbarText', v)} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">Live Indicator</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <ColorField label="Badge Background" value={settings.liveIndicatorBg} onChange={(v) => updateSetting('liveIndicatorBg', v)} />
                  <ColorField label="Badge Text" value={settings.liveIndicatorText} onChange={(v) => updateSetting('liveIndicatorText', v)} />
                  <ColorField label="Dot Color" value={settings.liveDotColor} onChange={(v) => updateSetting('liveDotColor', v)} />
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'misc' && (
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">Overlay</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <ColorField label="Mobile Overlay Color" value={settings.overlayBg} onChange={(v) => updateSetting('overlayBg', v)} />
                </CardContent>
              </Card>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Save className="h-4 w-4 mr-2" />
              {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button variant="outline" onClick={resetToDefaults}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to Defaults
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Live Preview</CardTitle></CardHeader>
            <CardContent>
              <div
                className="rounded-lg border overflow-hidden"
                style={{ borderColor: `hsl(${settings.sidebarBorder})` }}
              >
                <div
                  className="p-3 border-b flex items-center gap-2"
                  style={{
                    backgroundColor: `hsl(${settings.navbarBg} / ${settings.navbarBgOpacity})`,
                    borderColor: `hsl(${settings.navbarBorder})`,
                  }}
                >
                  <div className="h-4 w-4 rounded bg-muted" />
                  <div className="text-xs font-medium" style={{ color: `hsl(${settings.navbarText})` }}>Dashboard</div>
                  <div className="ml-auto flex items-center gap-1">
                    <div
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: `hsl(${settings.liveDotColor})` }}
                    />
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: `hsl(${settings.liveIndicatorBg})`,
                        color: `hsl(${settings.liveIndicatorText})`,
                      }}
                    >
                      Live
                    </span>
                  </div>
                </div>
                <div className="flex">
                  <div
                    className="w-32 border-r p-2 space-y-1"
                    style={{
                      backgroundColor: `hsl(${settings.sidebarBg} / ${settings.sidebarBgOpacity})`,
                      borderColor: `hsl(${settings.sidebarBorder})`,
                    }}
                  >
                    {['Home', 'Offers', 'Branches'].map((item, i) => (
                      <div
                        key={item}
                        className="text-[10px] px-2 py-1 rounded"
                        style={i === 0
                          ? {
                              backgroundColor: `hsl(${settings.sidebarActiveBg} / 0.1)`,
                              color: `hsl(${settings.sidebarActiveText})`,
                            }
                          : {
                              color: `hsl(${settings.sidebarTextMuted})`,
                            }
                        }
                        onMouseEnter={(e) => {
                          if (i !== 0) {
                            e.currentTarget.style.backgroundColor = `hsl(${settings.sidebarHoverBg})`
                            e.currentTarget.style.color = `hsl(${settings.sidebarHoverText})`
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (i !== 0) {
                            e.currentTarget.style.backgroundColor = ''
                            e.currentTarget.style.color = `hsl(${settings.sidebarTextMuted})`
                          }
                        }}
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 p-3">
                    <div className="h-2 w-24 bg-muted rounded mb-2" />
                    <div className="h-2 w-16 bg-muted rounded" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Current Settings</CardTitle></CardHeader>
            <CardContent>
              <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap">
                {JSON.stringify(settings, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
