/**
 * Google Drive API client — ADC (Application Default Credentials) 기반.
 *
 * 인증 흐름:
 *   1. `gcloud auth application-default login --scopes=...drive.readonly` 1회 실행 (사용자)
 *   2. ~/.config/gcloud/application_default_credentials.json 자동 생성
 *   3. 본 모듈은 GoogleAuth({scopes}) 로 ADC 자동 발견
 *   4. udpb@udimpact.ai 의 권한으로 Drive API 호출 → external-sharing 차단 우회
 *
 * 호출 사례:
 *   - listFolder(folderId) — 폴더 내 직속 자식 (파일+폴더)
 *   - walkFolder(folderId) — 재귀 트리 (depth 제한)
 *   - downloadFile(fileId) — 바이너리 download (PDF/PPT/DOCX)
 *   - exportFile(fileId, mimeType) — Google Docs → PDF/text 변환
 *
 * server-only 의도. scripts/ 환경에서도 동작 (ADC 는 환경 무관).
 */

import { drive_v3, drive } from '@googleapis/drive'
import { GoogleAuth } from 'google-auth-library'
import { log } from '@/lib/logger'

// ─────────────────────────────────────────
// 1. Auth + Client (lazy singleton)
// ─────────────────────────────────────────

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly']

let _client: drive_v3.Drive | null = null

export function getDriveClient(): drive_v3.Drive {
  if (_client) return _client
  const auth = new GoogleAuth({ scopes: SCOPES })
  _client = drive({ version: 'v3', auth })
  return _client
}

// ─────────────────────────────────────────
// 2. Types
// ─────────────────────────────────────────

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  /** 폴더 여부 (mimeType === 'application/vnd.google-apps.folder') */
  isFolder: boolean
  /** parent 폴더 id (root 면 ['root']) */
  parents: string[]
  size?: number
  modifiedTime?: string
  webViewLink?: string
}

/** Drive API 파일 → 우리 타입으로 변환 */
function toDriveFile(f: drive_v3.Schema$File): DriveFile {
  return {
    id: f.id ?? '',
    name: f.name ?? '(unnamed)',
    mimeType: f.mimeType ?? 'application/octet-stream',
    isFolder: f.mimeType === 'application/vnd.google-apps.folder',
    parents: f.parents ?? [],
    size: f.size ? Number(f.size) : undefined,
    modifiedTime: f.modifiedTime ?? undefined,
    webViewLink: f.webViewLink ?? undefined,
  }
}

// ─────────────────────────────────────────
// 3. listFolder — 폴더 직속 자식 (1 depth)
// ─────────────────────────────────────────

/**
 * 폴더 ID 의 직속 자식들 (페이지네이션 자동 처리, max 1000).
 *
 * trashed=false 만. shared drive 도 OK (supportsAllDrives:true).
 */
export async function listFolder(
  folderId: string,
  options: { pageSize?: number; maxTotal?: number } = {},
): Promise<DriveFile[]> {
  const pageSize = options.pageSize ?? 200
  const maxTotal = options.maxTotal ?? 1000

  const drive = getDriveClient()
  const out: DriveFile[] = []
  let pageToken: string | undefined

  while (out.length < maxTotal) {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      pageSize,
      pageToken,
      fields:
        'nextPageToken, files(id, name, mimeType, parents, size, modifiedTime, webViewLink)',
      // Shared Drive (Team Drive) 지원
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      // 결과 안정성을 위해 이름순
      orderBy: 'folder, name',
    })

    const files = (res.data.files ?? []).map(toDriveFile)
    out.push(...files)
    pageToken = res.data.nextPageToken ?? undefined
    if (!pageToken) break
  }

  log.debug('drive', `listFolder(${folderId}) → ${out.length} items`)
  return out.slice(0, maxTotal)
}

// ─────────────────────────────────────────
// 4. walkFolder — 재귀 트리 (depth 제한)
// ─────────────────────────────────────────

export interface DriveTreeNode {
  file: DriveFile
  /** 폴더면 자식들. 파일이면 undefined */
  children?: DriveTreeNode[]
  depth: number
}

/**
 * 폴더를 재귀 탐색해 트리 구성. 파일 카운트 폭주 방지 위해 maxTotal 제한.
 */
export async function walkFolder(
  folderId: string,
  options: { maxDepth?: number; maxTotal?: number } = {},
): Promise<DriveTreeNode> {
  const maxDepth = options.maxDepth ?? 4
  const maxTotal = options.maxTotal ?? 2000

  const drive = getDriveClient()
  // root 자체 메타
  const rootRes = await drive.files.get({
    fileId: folderId,
    fields: 'id, name, mimeType, parents, size, modifiedTime, webViewLink',
    supportsAllDrives: true,
  })
  const rootFile = toDriveFile(rootRes.data)

  let totalCount = 1
  async function walk(node: DriveTreeNode): Promise<void> {
    if (totalCount >= maxTotal) return
    if (!node.file.isFolder) return
    if (node.depth >= maxDepth) return
    const children = await listFolder(node.file.id, {
      maxTotal: maxTotal - totalCount,
    })
    totalCount += children.length
    node.children = children.map((f) => ({
      file: f,
      depth: node.depth + 1,
    }))
    // 폴더만 재귀
    for (const child of node.children) {
      if (child.file.isFolder) await walk(child)
    }
  }

  const root: DriveTreeNode = { file: rootFile, depth: 0 }
  await walk(root)
  log.debug('drive', `walkFolder(${folderId}) → ${totalCount} items (maxDepth=${maxDepth})`)
  return root
}

// ─────────────────────────────────────────
// 5. downloadFile — 바이너리 download
// ─────────────────────────────────────────

/**
 * 바이너리 파일 download (PDF/PPT/DOCX/XLSX 등).
 * Google Docs/Sheets/Slides 는 exportFile() 사용 (mimeType 변환 필요).
 */
export async function downloadFile(fileId: string): Promise<Buffer> {
  const drive = getDriveClient()
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  )
  // res.data 는 ArrayBuffer (responseType 지정 시)
  return Buffer.from(res.data as ArrayBuffer)
}

/**
 * 파일 메타데이터 조회 (download 전 종류·크기 확인).
 */
export async function getFileMeta(fileId: string): Promise<DriveFile> {
  const drive = getDriveClient()
  const res = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, parents, size, modifiedTime, webViewLink',
    supportsAllDrives: true,
  })
  return toDriveFile(res.data)
}

/**
 * Google Docs/Sheets/Slides → 다른 형식으로 export.
 *
 * 일반 mimeType:
 *   - 'application/pdf' (모든 Google Workspace 파일)
 *   - 'text/plain' (Docs only)
 *   - 'text/csv' (Sheets only)
 *   - 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' (Sheets → xlsx)
 *   - 'application/vnd.openxmlformats-officedocument.presentationml.presentation' (Slides → pptx)
 *   - 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' (Docs → docx)
 */
export async function exportFile(
  fileId: string,
  exportMimeType: string,
): Promise<Buffer> {
  const drive = getDriveClient()
  const res = await drive.files.export(
    { fileId, mimeType: exportMimeType },
    { responseType: 'arraybuffer' },
  )
  return Buffer.from(res.data as ArrayBuffer)
}

// ─────────────────────────────────────────
// 6. Shared Drives + Shared with me
// ─────────────────────────────────────────

export interface SharedDrive {
  id: string
  name: string
  createdTime?: string
}

/**
 * Shared Drives (구 Team Drives) 목록 — 본 계정이 멤버인 모든 공유 드라이브.
 *
 * Shared Drive 는 일반 폴더와 다른 entity. listFolder() 의 folderId 로
 * Shared Drive ID 를 넘기면 그 루트 안 트리 탐색 가능 (supportsAllDrives:true 이미 설정).
 */
export async function listSharedDrives(
  options: { pageSize?: number; maxTotal?: number } = {},
): Promise<SharedDrive[]> {
  const pageSize = options.pageSize ?? 100
  const maxTotal = options.maxTotal ?? 1000
  const drive = getDriveClient()

  const out: SharedDrive[] = []
  let pageToken: string | undefined
  while (out.length < maxTotal) {
    const res = await drive.drives.list({
      pageSize,
      pageToken,
      fields: 'nextPageToken, drives(id, name, createdTime)',
    })
    const drives = (res.data.drives ?? []).map((d) => ({
      id: d.id ?? '',
      name: d.name ?? '(unnamed)',
      createdTime: d.createdTime ?? undefined,
    }))
    out.push(...drives)
    pageToken = res.data.nextPageToken ?? undefined
    if (!pageToken) break
  }
  log.debug('drive', `listSharedDrives → ${out.length} drives`)
  return out.slice(0, maxTotal)
}

/**
 * "Shared with me" — 본 계정에 직접 공유된 파일/폴더 최상위.
 *
 * Drive 웹 UI 의 "공유 문서함" 에 보이는 그 목록.
 * 폴더라면 ID 를 walkFolder() 에 넘겨 안 트리 탐색 가능.
 */
export async function listSharedWithMe(
  options: { pageSize?: number; maxTotal?: number } = {},
): Promise<DriveFile[]> {
  const pageSize = options.pageSize ?? 200
  const maxTotal = options.maxTotal ?? 1000
  const drive = getDriveClient()

  const out: DriveFile[] = []
  let pageToken: string | undefined
  while (out.length < maxTotal) {
    const res = await drive.files.list({
      q: 'sharedWithMe=true and trashed=false',
      pageSize,
      pageToken,
      fields:
        'nextPageToken, files(id, name, mimeType, parents, size, modifiedTime, webViewLink, sharingUser)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      orderBy: 'folder, name',
    })
    const files = (res.data.files ?? []).map(toDriveFile)
    out.push(...files)
    pageToken = res.data.nextPageToken ?? undefined
    if (!pageToken) break
  }
  log.debug('drive', `listSharedWithMe → ${out.length} items`)
  return out.slice(0, maxTotal)
}

// ─────────────────────────────────────────
// 7. MIME type 분류 helper
// ─────────────────────────────────────────

export const GOOGLE_MIME = {
  folder: 'application/vnd.google-apps.folder',
  doc: 'application/vnd.google-apps.document',
  sheet: 'application/vnd.google-apps.spreadsheet',
  slides: 'application/vnd.google-apps.presentation',
  form: 'application/vnd.google-apps.form',
} as const

/** 파일이 우리가 처리 가능한 자산 후보인지 판정 */
export function classifyAsset(mimeType: string, name: string): {
  category:
    | 'proposal-pdf' // 제안서 PDF/PPT
    | 'document' // 비제안서 문서 (회사소개·교재·방법론)
    | 'spreadsheet' // 스프레드시트
    | 'image' // 이미지 (썸네일·로고 — skip)
    | 'unknown'
  exportableAs: string | null
} {
  // Google Workspace native
  if (mimeType === GOOGLE_MIME.doc) {
    return {
      category: /제안서|proposal/i.test(name) ? 'proposal-pdf' : 'document',
      exportableAs: 'application/pdf',
    }
  }
  if (mimeType === GOOGLE_MIME.sheet) {
    return { category: 'spreadsheet', exportableAs: 'text/csv' }
  }
  if (mimeType === GOOGLE_MIME.slides) {
    return {
      category: /제안서|proposal/i.test(name) ? 'proposal-pdf' : 'document',
      exportableAs: 'application/pdf',
    }
  }
  // PDF
  if (mimeType === 'application/pdf') {
    return {
      category: /제안서|proposal/i.test(name) ? 'proposal-pdf' : 'document',
      exportableAs: null,
    }
  }
  // PPT/PPTX
  if (
    mimeType.includes('powerpoint') ||
    mimeType.includes('presentation') ||
    /\.(ppt|pptx)$/i.test(name)
  ) {
    return {
      category: /제안서|proposal/i.test(name) ? 'proposal-pdf' : 'document',
      exportableAs: null,
    }
  }
  // DOCX
  if (mimeType.includes('wordprocessingml') || /\.docx?$/i.test(name)) {
    return {
      category: /제안서|proposal/i.test(name) ? 'proposal-pdf' : 'document',
      exportableAs: null,
    }
  }
  // XLSX
  if (mimeType.includes('spreadsheetml') || /\.xlsx?$/i.test(name)) {
    return { category: 'spreadsheet', exportableAs: null }
  }
  // Image — skip
  if (mimeType.startsWith('image/')) {
    return { category: 'image', exportableAs: null }
  }
  return { category: 'unknown', exportableAs: null }
}
