import { useEffect } from 'react'
import type { AreaData } from '../lib/types'

interface Props {
  data: AreaData | null
  onClose: () => void
}

export default function InfoModal({ data, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="info-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="info-title">データの出典・ご利用にあたって</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <h3>データの出典</h3>
          <ul>
            <li>
              市外局番・番号区画: 総務省「
              <a href="https://www.soumu.go.jp/main_content/000141817.pdf" target="_blank" rel="noreferrer">
                市外局番の一覧
              </a>
              」{data?.meta.updated && `（${data.meta.updated}現在）`}を加工して作成（
              <a href="https://www.soumu.go.jp/menu_kyotsuu/policy/tos.html" target="_blank" rel="noreferrer">
                政府標準利用規約
              </a>
              ）
            </li>
            <li>
              MA名・市内局番の目安:{' '}
              <a href="https://github.com/google/libphonenumber" target="_blank" rel="noreferrer">
                Google libphonenumber
              </a>{' '}
              geocoding データ（Apache License 2.0）を参考に作成
            </li>
            <li>
              市区町村境界: 国土交通省「
              <a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-v3_1.html" target="_blank" rel="noreferrer">
                国土数値情報（行政区域データ）
              </a>
              」（2021年1月1日時点）を加工して作成。簡略化データは{' '}
              <a href="https://github.com/smartnews-smri/japan-topography" target="_blank" rel="noreferrer">
                smartnews-smri/japan-topography
              </a>{' '}
              を使用
            </li>
            <li>
              アイコン:{' '}
              <a href="https://fontawesome.com/" target="_blank" rel="noreferrer">
                Font Awesome Free
              </a>{' '}
              （CC BY 4.0）／地図表示:{' '}
              <a href="https://maplibre.org/" target="_blank" rel="noreferrer">
                MapLibre GL JS
              </a>{' '}
              （BSD-3-Clause）
            </li>
          </ul>
          <h3>ご注意</h3>
          <ul>
            <li>固定電話のみが対象です。携帯電話・IP電話・フリーダイヤル等は表示できません。</li>
            <li>番号区画（MA）は市区町村単位で色分けしています。町丁目単位でしか分かれない地域は「一部」と表示し、境界は正確ではありません。</li>
            <li>MA名は便宜上の呼び名です。同じ市外局番の番号区画の絞り込み（市内局番）は参考情報で、正確性を保証するものではありません。</li>
            <li>市区町村の境界は2021年時点のため、それ以降の合併・名称変更は反映されていません。</li>
            <li>本アプリは非営利の個人制作物で、正確性・最新性を保証しません。</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
