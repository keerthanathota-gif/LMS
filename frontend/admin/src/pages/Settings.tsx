import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Settings as SettingsIcon, Key, Eye, EyeOff, Save, Loader2, Trash2, AlertCircle } from 'lucide-react'
import { useAuthStore } from '@store/auth.store'
import api from '@services/api'
import toast from 'react-hot-toast'

interface Setting {
  key: string; value: string; is_secret: boolean; updated_at?: string
}

const TEMPLATES = [
  { key: 'azure_openai_endpoint',    label: 'Azure OpenAI Endpoint',     isSecret: false, placeholder: 'https://your-resource.openai.azure.com/' },
  { key: 'azure_openai_api_key',     label: 'Azure OpenAI API Key',      isSecret: true,  placeholder: 'sk-...' },
  { key: 'azure_openai_deployment',  label: 'Azure OpenAI Deployment',   isSecret: false, placeholder: 'gpt-4o' },
  { key: 'azure_openai_api_version', label: 'Azure OpenAI API Version',  isSecret: false, placeholder: '2025-01-01-preview' },
  { key: 'openai_api_key',           label: 'OpenAI API Key',            isSecret: true,  placeholder: 'sk-...' },
  { key: 'openai_model',             label: 'OpenAI Model',              isSecret: false, placeholder: 'gpt-4o' },
  { key: 'anthropic_api_key',        label: 'Anthropic API Key',         isSecret: true,  placeholder: 'sk-ant-...' },
  { key: 'anthropic_model',          label: 'Anthropic Model',           isSecret: false, placeholder: 'claude-sonnet-4-20250514' },
  { key: 'google_ai_api_key',        label: 'Google AI API Key',         isSecret: true,  placeholder: 'AIza...' },
  { key: 'smtp_host',                label: 'SMTP Host',                 isSecret: false, placeholder: 'smtp.sendgrid.net' },
  { key: 'smtp_port',                label: 'SMTP Port',                 isSecret: false, placeholder: '587' },
  { key: 'smtp_user',                label: 'SMTP User',                 isSecret: false, placeholder: 'apikey' },
  { key: 'smtp_password',            label: 'SMTP Password',             isSecret: true,  placeholder: '...' },
  { key: 'stripe_secret_key',        label: 'Stripe Secret Key',         isSecret: true,  placeholder: 'sk_live_...' },
  { key: 'stripe_publishable_key',   label: 'Stripe Publishable Key',    isSecret: false, placeholder: 'pk_live_...' },
]

export default function SettingsPage() {
  const { user } = useAuthStore()
  const [settings, setSettings]         = useState<Setting[]>([])
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [showSecrets, setShowSecrets]   = useState<Set<string>>(new Set())
  const [addKey, setAddKey]             = useState('')

  const orgId = user?.orgId ?? ''

  useEffect(() => {
    if (!orgId) return
    api.get(`/settings?orgId=${orgId}`)
      .then((res) => setSettings(res.data.data ?? []))
      .catch(() => setSettings([]))
      .finally(() => setLoading(false))
  }, [orgId])

  const handleChange = (key: string, value: string) => {
    setSettings((prev) => prev.map((s) => s.key === key ? { ...s, value } : s))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/settings', {
        orgId,
        settings: settings.map((s) => ({
          key: s.key,
          value: s.value,
          isSecret: s.is_secret,
        })),
      })
      toast.success('Settings saved')
      const res = await api.get(`/settings?orgId=${orgId}`)
      setSettings(res.data.data ?? [])
    } catch {
      toast.error('Failed to save settings')
    } finally { setSaving(false) }
  }

  const handleAdd = (templateKey: string) => {
    const tpl = TEMPLATES.find((t) => t.key === templateKey)
    if (!tpl || settings.find((s) => s.key === tpl.key)) return
    setSettings((prev) => [...prev, { key: tpl.key, value: '', is_secret: tpl.isSecret }])
    setAddKey('')
  }

  const handleDelete = async (key: string) => {
    try {
      await api.delete(`/settings/${key}?orgId=${orgId}`)
      setSettings((prev) => prev.filter((s) => s.key !== key))
      toast.success(`Removed ${key}`)
    } catch { toast.error('Failed to remove setting') }
  }

  const toggleSecret = (key: string) => {
    setShowSecrets((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const getTemplate = (key: string) => TEMPLATES.find((t) => t.key === key)
  const unusedTemplates = TEMPLATES.filter((t) => !settings.find((s) => s.key === t.key))

  if (loading) return (
    <div className="flex items-center justify-center h-full py-20">
      <Loader2 size={24} className="animate-spin text-indigo-400" />
    </div>
  )

  const llmSettings   = settings.filter((s) => s.key.includes('openai') || s.key.includes('anthropic') || s.key.includes('google'))
  const smtpSettings  = settings.filter((s) => s.key.startsWith('smtp'))
  const otherSettings = settings.filter((s) => !s.key.includes('openai') && !s.key.includes('anthropic') && !s.key.includes('google') && !s.key.startsWith('smtp'))

  const renderGroup = (title: string, icon: React.ReactNode, items: Setting[]) => {
    if (items.length === 0) return null
    return (
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-border flex items-center gap-2.5">
          {icon}
          <h2 className="text-sm font-semibold font-display text-text-primary">{title}</h2>
        </div>
        <div className="divide-y divide-surface-border">
          {items.map((s) => {
            const tpl = getTemplate(s.key)
            const isVisible = showSecrets.has(s.key)
            return (
              <div key={s.key} className="px-5 py-4">
                <div className="flex items-center justify-between mb-2.5">
                  <div>
                    <label className="text-sm font-semibold text-text-primary">{tpl?.label ?? s.key}</label>
                    <p className="text-xs text-text-muted font-mono mt-0.5">{s.key}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(s.key)}
                    className="p-1.5 text-text-muted hover:text-accent-rose hover:bg-accent-rose/10 rounded-lg transition-colors"
                    title="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type={s.is_secret && !isVisible ? 'password' : 'text'}
                    value={s.value}
                    onChange={(e) => handleChange(s.key, e.target.value)}
                    placeholder={tpl?.placeholder ?? ''}
                    className="flex-1 px-3.5 py-2.5 text-sm bg-surface-secondary border border-surface-border rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 font-mono transition-all"
                  />
                  {s.is_secret && (
                    <button
                      onClick={() => toggleSecret(s.key)}
                      className="p-2.5 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-xl transition-colors"
                      title={isVisible ? 'Hide' : 'Show'}
                    >
                      {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  )}
                </div>
                {s.updated_at && (
                  <p className="text-[10px] text-text-muted mt-1.5">
                    Last updated: {new Date(s.updated_at).toLocaleString()}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold font-display text-text-primary flex items-center gap-2.5">
            <SettingsIcon size={20} className="text-indigo-500" /> Settings
          </h1>
          <p className="text-sm text-text-muted mt-0.5">Configure API keys and platform settings</p>
        </div>
        <motion.button
          onClick={handleSave}
          disabled={saving}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium disabled:opacity-50 transition-colors shadow-sm shadow-indigo-500/20"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save All
        </motion.button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl">
        <AlertCircle size={16} className="text-indigo-500 shrink-0 mt-0.5" />
        <div className="text-xs text-text-secondary">
          <p className="font-semibold text-text-primary mb-1">API Configuration</p>
          <p>Add your LLM API keys here. Secret keys are encrypted and masked after saving. These settings are per-organization and don&apos;t affect system environment variables.</p>
        </div>
      </div>

      {/* Add setting */}
      {unusedTemplates.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={addKey}
            onChange={(e) => { handleAdd(e.target.value) }}
            className="flex-1 px-3.5 py-2.5 text-sm bg-surface-secondary border border-surface-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
          >
            <option value="">Add a setting...</option>
            <optgroup label="LLM Providers">
              {unusedTemplates.filter((t) => t.key.includes('openai') || t.key.includes('anthropic') || t.key.includes('google')).map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </optgroup>
            <optgroup label="Email / SMTP">
              {unusedTemplates.filter((t) => t.key.startsWith('smtp')).map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </optgroup>
            <optgroup label="Payments">
              {unusedTemplates.filter((t) => t.key.startsWith('stripe')).map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </optgroup>
          </select>
        </div>
      )}

      {/* Setting groups */}
      {renderGroup('LLM / AI Configuration', <Key size={15} className="text-indigo-500" />, llmSettings)}
      {renderGroup('Email / SMTP', <SettingsIcon size={15} className="text-navy-400" />, smtpSettings)}
      {renderGroup('Other Settings', <SettingsIcon size={15} className="text-text-muted" />, otherSettings)}

      {settings.length === 0 && (
        <div className="card p-14 text-center">
          <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Key size={24} className="text-indigo-400" />
          </div>
          <p className="text-sm font-semibold text-text-secondary">No settings configured yet</p>
          <p className="text-xs text-text-muted mt-1">Use the dropdown above to add API keys and configuration</p>
        </div>
      )}
    </div>
  )
}
