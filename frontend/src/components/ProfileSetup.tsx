import { useState } from 'react'
import { createProfile } from '../api/mentor'
import type { Profile, SkillLevel } from '../api/mentor'

interface Props {
  authUserId: string
  onComplete: (profile: Profile) => void
}

export function ProfileSetup({ authUserId, onComplete }: Props) {
  const [fullName, setFullName] = useState('')
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('intermediate')
  const [knownStack, setKnownStack] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const profile = await createProfile({
        auth_user_id: authUserId,
        full_name: fullName.trim(),
        skill_level: skillLevel,
        known_stack: knownStack.trim() || undefined,
      })
      onComplete(profile)
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? err.message ?? 'Failed to create profile.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <h2>Set up your profile</h2>
        <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
          This helps the mentor tailor its advice to your background.
        </p>

        {error && <p className="error-msg">{error}</p>}

        <form onSubmit={submit} className="form">
          <label>
            Full name
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="e.g. Priya Sharma"
              required
            />
          </label>

          <label>
            Skill level
            <select value={skillLevel} onChange={e => setSkillLevel(e.target.value as SkillLevel)}>
              <option value="beginner">Beginner — new to programming</option>
              <option value="intermediate">Intermediate — comfortable with basics</option>
              <option value="advanced">Advanced — built projects before</option>
            </select>
          </label>

          <label>
            Known technologies <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
            <input
              type="text"
              value={knownStack}
              onChange={e => setKnownStack(e.target.value)}
              placeholder="e.g. Python, React, MySQL"
            />
          </label>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Saving…' : 'Save and continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
