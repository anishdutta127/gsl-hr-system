import { notFound, redirect } from 'next/navigation'
import { findApplicationById, findRoleById } from '@/lib/data'
import { getCurrentCandidateId } from '@/lib/candidateIdentity'
import { VideoLinkForm } from './VideoLinkForm'
import { SUPPORTED_VIDEO_HOSTS } from '@/lib/videoUrl'

export const dynamic = 'force-dynamic'

export default async function VideoPage({ params }: { params: { id: string } }) {
  const candidateId = await getCurrentCandidateId()
  if (!candidateId) redirect('/portal/request-new-link')

  const app = findApplicationById(params.id)
  if (!app || app.candidateId !== candidateId) notFound()
  const role = findRoleById(app.roleId)
  if (!role) notFound()

  const done = app.currentStage === 'VideoDone'
  const active = app.currentStage === 'VideoSent' || done

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-2xl text-ink">Video introduction: {role.title}</h1>

        {!active ? (
          <div className="mt-6 rounded-lg border border-line bg-card p-6 text-sm text-ink-2">
            No video step is active right now.
          </div>
        ) : (
          <>
            <section className="mt-6 rounded-lg border border-line bg-card p-6">
              <h2 className="font-display text-lg text-ink">How to submit</h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink">
                <li>Record a 60-90 second introduction on your phone.</li>
                <li>Upload it to Google Drive, OneDrive, or SharePoint.</li>
                <li>Set share to "anyone with the link can view".</li>
                <li>Paste the link below.</li>
              </ol>
              <p className="mt-4 text-xs text-ink-3">
                Supported hosts: {SUPPORTED_VIDEO_HOSTS.join(', ')}.
              </p>
            </section>

            {done ? (
              <div
                role="status"
                className="mt-6 rounded-lg border border-success bg-success-bg p-6 text-sm text-ink"
              >
                Thanks — your video is in. The team will review it shortly.
              </div>
            ) : (
              <section className="mt-6 rounded-lg border border-line bg-card p-6">
                <h2 className="font-display text-lg text-ink">Paste your video link</h2>
                <VideoLinkForm applicationId={app.id} />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
