'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Role, Stage } from '@/lib/types'
import type { ApplicationWithCandidate } from '@/lib/data'
import { StageTransitionButtons } from '@/components/stageTransition/StageTransitionButtons'
import { ConfirmModal } from '@/components/stageTransition/ConfirmModal'
import { RejectReasonModal } from '@/components/stageTransition/RejectReasonModal'
import { useStageTransitions } from '@/components/stageTransition/useStageTransitions'

interface Props {
  role: Role
  applicationId: string
  candidateId: string
  candidateName: string
  currentStage: Stage
  createdAt: string
  createdBy: string
  stageEnteredAt: string
  /** Whether the role is read-only (Closed/Archived). Disables actions. */
  disabled: boolean
}

/**
 * Per-application transition strip on the candidate detail page. Reuses the
 * same hook as the Kanban for consistent affordances (undo, confirm, reject
 * reason). Each app row hosts its own controller — multi-app candidates get
 * independent transitions per role.
 */
export function ApplicationStageActions(props: Props) {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>(props.currentStage)

  const applicationFacade: ApplicationWithCandidate = {
    id: props.applicationId,
    candidateId: props.candidateId,
    roleId: props.role.id,
    currentStage: stage,
    stageEnteredAt: props.stageEnteredAt,
    createdAt: props.createdAt,
    createdBy: props.createdBy,
    auditLog: [],
    candidate: {
      id: props.candidateId,
      name: props.candidateName,
      email: '',
      phone: '',
      source: 'Other',
      createdAt: props.createdAt,
      createdBy: props.createdBy,
      auditLog: [],
    },
  }

  const apply = useCallback((_id: string, to: Stage) => setStage(to), [])
  const revert = useCallback((_id: string, to: Stage) => setStage(to), [])

  const transitions = useStageTransitions({
    applications: [applicationFacade],
    roleByApplicationId: () => props.role,
    applyOptimistic: apply,
    revertOptimistic: revert,
    refreshServer: () => router.refresh(),
  })

  return (
    <>
      <StageTransitionButtons
        role={props.role}
        applicationId={props.applicationId}
        currentStage={stage}
        disabled={props.disabled || transitions.busyApplicationIds.has(props.applicationId)}
        visibility="static"
        onIntent={transitions.onIntent}
      />
      {transitions.successToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded bg-ink px-4 py-2 text-sm text-white shadow-lg"
        >
          <span>{transitions.successToast.message}</span>
          {transitions.successToast.undo && (
            <button
              type="button"
              onClick={transitions.successToast.undo}
              className="rounded border border-white/30 px-2 py-0.5 text-xs font-medium text-white hover:bg-white/10"
            >
              Undo
            </button>
          )}
        </div>
      )}
      {transitions.errorToast && (
        <div
          role="alert"
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded bg-danger px-4 py-2 text-sm text-white shadow-lg"
        >
          <span>{transitions.errorToast}</span>
          <button
            onClick={transitions.dismissError}
            className="ml-3 underline"
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}
      {transitions.confirmModal && (
        <ConfirmModal
          open={transitions.confirmModal.open}
          title={transitions.confirmModal.title}
          body={transitions.confirmModal.body}
          variant={transitions.confirmModal.variant}
          confirmLabel={transitions.confirmModal.confirmLabel}
          onConfirm={transitions.confirmModal.onConfirm}
          onCancel={transitions.confirmModal.onCancel}
        />
      )}
      {transitions.rejectModal && (
        <RejectReasonModal
          open={transitions.rejectModal.open}
          subjectLabel={transitions.rejectModal.subjectLabel}
          bulk={transitions.rejectModal.bulk}
          busy={transitions.rejectModal.busy}
          onCancel={transitions.rejectModal.onCancel}
          onSubmit={transitions.rejectModal.onSubmit}
        />
      )}
    </>
  )
}
