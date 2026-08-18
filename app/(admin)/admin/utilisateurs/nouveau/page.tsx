import Link from 'next/link'
import { UserCreateForm } from '@/components/admin/UserCreateForm'
import { Card } from '@/components/ui/Card'

export default function NewUserPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Link href="/admin/utilisateurs" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Utilisateurs
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Créer un utilisateur</h1>
      <p className="mt-1 text-sm text-slate-500">
        Crée directement un compte client, sans passer par l&apos;inscription self-service.
      </p>
      <Card className="mt-6">
        <UserCreateForm />
      </Card>
    </main>
  )
}
