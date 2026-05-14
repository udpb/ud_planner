'use client'

/**
 * PersistentErrorBanner — toast 으로 사라지면 안 되는 에러 영구 표시.
 *
 * 사용 시점:
 *   - RFP 파싱 실패 (대안 액션 필요)
 *   - AI quota 초과 / API 키 누락 (운영 액션 필요)
 *   - DB 연결 실패 / 권한 거부
 *
 * sonner toast 와 병행 — toast 는 잠깐 알림, banner 는 해결까지 유지.
 *
 * 사용법:
 *   <PersistentErrorBanner
 *     errors={errors}
 *     onDismiss={(id) => dismiss(id)}
 *   />
 *
 *   const [errors, setErrors] = useState<PersistentError[]>([])
 *   setErrors((es) => [...es, { id, severity, title, message, action }])
 */

import { AlertTriangle, XCircle, X, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PersistentError {
  id: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  message: string
  /** 선택 — PM 이 클릭해서 해결할 액션 (예: "지원팀 연락") */
  action?: { label: string; href?: string; onClick?: () => void }
  /** 기본 false — true 면 사용자가 X 눌러도 안 사라짐 (운영 액션 필수) */
  blocking?: boolean
}

interface Props {
  errors: PersistentError[]
  onDismiss?: (id: string) => void
  className?: string
}

const ICONS = {
  critical: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const COLORS = {
  critical: 'border-red-300 bg-red-50/80 text-red-900',
  warning: 'border-amber-300 bg-amber-50/80 text-amber-900',
  info: 'border-sky-300 bg-sky-50/80 text-sky-900',
}

export function PersistentErrorBanner({ errors, onDismiss, className }: Props) {
  if (errors.length === 0) return null

  return (
    <div className={cn('space-y-1.5', className)}>
      {errors.map((err) => {
        const Icon = ICONS[err.severity]
        return (
          <div
            key={err.id}
            role="alert"
            className={cn(
              'flex items-start gap-2 rounded-md border px-3 py-2 text-xs',
              COLORS[err.severity],
            )}
          >
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold">{err.title}</div>
              <div className="mt-0.5 leading-relaxed text-[11px] opacity-90">
                {err.message}
              </div>
              {err.action && (
                <div className="mt-1.5">
                  {err.action.href ? (
                    <a
                      href={err.action.href}
                      className="text-[11px] font-medium underline hover:no-underline"
                    >
                      {err.action.label} →
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={err.action.onClick}
                      className="text-[11px] font-medium underline hover:no-underline"
                    >
                      {err.action.label} →
                    </button>
                  )}
                </div>
              )}
            </div>
            {!err.blocking && (
              <button
                type="button"
                onClick={() => onDismiss?.(err.id)}
                className="shrink-0 opacity-60 hover:opacity-100"
                aria-label="닫기"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
