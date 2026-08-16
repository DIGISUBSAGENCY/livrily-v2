import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Image Open Graph par défaut, générée à la volée (pas de fichier binaire à
// maintenir) — sert de fallback pour toute page qui n'a pas la sienne.
// Convention Next.js : ce fichier au nom réservé "opengraph-image" est
// automatiquement détecté et branché aux métadonnées de app/layout.tsx.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0A5740 0%, #0D6E4E 55%, #14876B 100%)',
        }}
      >
        <div
          style={{
            fontSize: 116,
            fontWeight: 700,
            color: '#FFFFFF',
            letterSpacing: -2,
          }}
        >
          Livrily
        </div>
        <div
          style={{
            marginTop: 20,
            fontSize: 34,
            color: '#D3F0E4',
            display: 'flex',
          }}
        >
          Livraison à la demande en Tunisie
        </div>
      </div>
    ),
    { ...size }
  )
}
