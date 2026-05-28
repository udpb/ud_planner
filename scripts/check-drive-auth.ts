/**
 * Drive auth 빠른 점검 — L3 진행 가능성 확인.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
for (const file of ['.env', '.env.local']) {
  const envPath = path.join(process.cwd(), file)
  if (!fs.existsSync(envPath)) continue
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    process.env[k] = v
  }
}

async function main() {
  console.log('▶ Drive auth check\n')

  // First check ADC file exists
  const adcPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(process.env.HOME ?? process.env.USERPROFILE ?? '', '.config', 'gcloud', 'application_default_credentials.json')
  console.log(`ADC 파일 경로: ${adcPath}`)
  console.log(`존재: ${fs.existsSync(adcPath)}`)

  if (!fs.existsSync(adcPath)) {
    // Windows 경로
    const winPath = path.join(process.env.APPDATA ?? '', 'gcloud', 'application_default_credentials.json')
    console.log(`Windows ADC 경로: ${winPath}`)
    console.log(`존재: ${fs.existsSync(winPath)}`)
  }

  // 시도 — file ID 가 drive: refs 에서 추출
  const testFileId = '1czK21fRpDHQY-3nSV9qZ8t5nEo6VfN1m'
  console.log(`\n테스트 fileId: ${testFileId}`)

  try {
    const { drive } = await import('@googleapis/drive')
    const { GoogleAuth } = await import('google-auth-library')
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive.readonly'] })
    const client = drive({ version: 'v3', auth })
    const meta = await client.files.get({
      fileId: testFileId,
      fields: 'id,name,mimeType,size',
      supportsAllDrives: true,
    })
    console.log('\n✓ 파일 메타 조회 성공:')
    console.log('  name:', meta.data.name)
    console.log('  mimeType:', meta.data.mimeType)
    console.log('  size:', meta.data.size)
    console.log('\n✅ Drive auth OK — L3 진행 가능')
  } catch (err: any) {
    console.log('\n❌ Drive auth 실패:')
    console.log('  message:', err?.message?.slice(0, 200))
    if (err?.code) console.log('  code:', err.code)
    if (err?.response?.data) {
      console.log('  response:', JSON.stringify(err.response.data).slice(0, 300))
    }
    console.log('\n원인:')
    console.log('  1. gcloud auth application-default login 안 됨')
    console.log('  2. Trusted App 등록 안 됨 (task #9 — udpb 계정 admin 등록 필요)')
    console.log('  3. 파일이 udpb 계정에 공유 안 됨')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
