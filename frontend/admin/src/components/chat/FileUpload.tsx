import { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, X, FileText, Video, Music, Presentation, Loader2 } from 'lucide-react'
import { useAuthStore } from '@store/auth.store'

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/zip': ['.zip'],
}

const MAX_SIZE = 500 * 1024 * 1024 // 500MB

function fileIcon(type: string) {
  if (type.includes('pdf') || type.includes('presentation')) return FileText
  if (type.includes('video')) return Video
  if (type.includes('audio')) return Music
  return Presentation
}

interface FileUploadProps {
  onClose: () => void
  onFilesUploaded?: (contextText: string) => void
}

export default function FileUpload({ onClose, onFilesUploaded }: FileUploadProps) {
  const { accessToken } = useAuthStore()
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const { getRootProps, getInputProps, isDragActive, acceptedFiles, fileRejections } = useDropzone({
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE,
    maxFiles: 5,
  })

  const handleUpload = async () => {
    if (acceptedFiles.length === 0 || uploading) return
    setUploading(true)
    setUploadError('')

    try {
      const contextParts: string[] = []

      for (const file of acceptedFiles) {
        const formData = new FormData()
        formData.append('file', file)

        const res = await fetch('/api/content/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          body: formData,
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error((err as { detail?: string }).detail ?? `Upload failed: ${file.name}`)
        }

        const data = await res.json()
        const responseData = data.data ?? data
        // For video/audio uploads: inject the hosted URL so the agent can use it in add_module_with_content
        if (file.type.includes('video') || file.type.includes('audio')) {
          const fileUrl: string = responseData.file_url ?? responseData.fileUrl ?? ''
          const objectKey: string = responseData.object_key ?? responseData.objectKey ?? ''
          contextParts.push(
            `[${file.type.includes('video') ? 'Video' : 'Audio'} uploaded: ${file.name} | url=${fileUrl} | key=${objectKey}]`,
          )
        } else {
          // PDF / text: inject extracted text for AI context
          const text: string = responseData.transcript ?? responseData.text ?? responseData.summary ?? ''
          if (text) {
            contextParts.push(
              `[File: ${file.name}]\n${text.slice(0, 3000)}${text.length > 3000 ? '\n...(truncated)' : ''}`,
            )
          } else {
            contextParts.push(`[File: ${file.name} uploaded successfully | url=${responseData.file_url ?? ''}]`)
          }
        }
      }

      onFilesUploaded?.(contextParts.join('\n\n'))
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mx-5 mb-3 border border-surface-border rounded-2xl overflow-hidden animate-slide-up">
      <div className="flex items-center justify-between px-4 py-3 bg-surface-card border-b border-surface-border">
        <p className="text-sm font-medium text-text-primary">Upload Content</p>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary">
          <X size={16} />
        </button>
      </div>

      <div
        {...getRootProps()}
        className={`p-6 cursor-pointer transition-colors ${
          isDragActive ? 'bg-brand-500/5 border-brand-500' : 'bg-surface hover:bg-surface-hover'
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center text-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDragActive ? 'bg-brand-500/20' : 'bg-surface-border'}`}>
            <Upload size={18} className={isDragActive ? 'text-brand-400' : 'text-text-muted'} />
          </div>
          <div>
            <p className="text-sm text-text-secondary font-medium">
              {isDragActive ? 'Drop files here' : 'Drag & drop or click to browse'}
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              PDF, MP4, MOV, MP3, WAV, PPTX, SCORM ZIP · Max 500MB per file
            </p>
          </div>
        </div>
      </div>

      {/* Accepted Files */}
      {acceptedFiles.length > 0 && (
        <div className="px-4 py-3 bg-surface space-y-2">
          {acceptedFiles.map((f) => {
            const Icon = fileIcon(f.type)
            return (
              <div key={f.name} className="flex items-center gap-3 text-sm">
                <Icon size={14} className="text-brand-400 shrink-0" />
                <span className="text-text-primary truncate">{f.name}</span>
                <span className="text-text-muted ml-auto shrink-0">
                  {(f.size / 1024 / 1024).toFixed(1)} MB
                </span>
              </div>
            )
          })}

          {uploadError && (
            <p className="text-xs text-status-error bg-status-error/5 rounded-lg px-3 py-2">
              {uploadError}
            </p>
          )}

          <button
            onClick={handleUpload}
            disabled={uploading}
            className="flex items-center justify-center gap-2 w-full py-2 text-sm font-medium bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg transition-colors mt-2"
          >
            {uploading && <Loader2 size={13} className="animate-spin" />}
            {uploading ? 'Uploading...' : 'Upload & Process'}
          </button>
        </div>
      )}

      {/* Rejections */}
      {fileRejections.length > 0 && (
        <div className="px-4 py-3 bg-status-error/5">
          {fileRejections.map(({ file, errors }) => (
            <p key={file.name} className="text-xs text-status-error">
              {file.name}: {errors.map((e) => e.message).join(', ')}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
