/**
 * Ingestion 파일 저장 헬퍼
 *
 * Phase A: 로컬 파일시스템 `./storage/ingest/<jobId>/<filename>` 에 저장.
 *
 * TODO(Phase D / Vercel 배포): 로컬 파일시스템은 Vercel 서버리스에서 휘발성·격리됨.
 *   배포 전 Vercel Blob, S3, 또는 영구 스토리지로 교체 필요.
 *   교체 시 이 파일만 수정하면 호출부는 그대로 유지 가능.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const STORAGE_ROOT = path.join(process.cwd(), 'storage', 'ingest')

export interface SavedFileInfo {
  /** DB 의 sourceFile 컬럼에 저장할 경로 (storage 루트 상대) */
  storagePath: string
  /** 절대 경로 (런타임 디버깅용) */
  absolutePath: string
  /** 원본 파일명 */
  filename: string
  /** 바이트 크기 */
  size: number
}

/**
 * 파일명에서 위험 문자를 제거. 경로 트래버설 방지.
 */
function sanitizeFilename(name: string): string {
  // path 구분자 / null / 제어문자 제거. 공백은 _ 로.
  const cleaned = name
    .replace(/[\/\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '_') // ".." 등 방지
    .slice(0, 200)        // 너무 긴 이름 방지
  return cleaned || 'unnamed'
}

/**
 * 업로드된 File 객체를 로컬 storage 에 저장.
 * jobId 별 폴더로 격리.
 */
export async function saveIngestionFile(
  jobId: string,
  file: File,
): Promise<SavedFileInfo> {
  const filename = sanitizeFilename(file.name)
  const dir = path.join(STORAGE_ROOT, jobId)
  await mkdir(dir, { recursive: true })

  const absolutePath = path.join(dir, filename)
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(absolutePath, buffer)

  // DB 에는 상대 경로만 저장 (스토리지 루트 변경 시 마이그레이션 용이)
  const storagePath = `ingest/${jobId}/${filename}`

  return {
    storagePath,
    absolutePath,
    filename,
    size: buffer.byteLength,
  }
}
