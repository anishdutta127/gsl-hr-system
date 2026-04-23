export default function OffersPage() {
  return (
    <div className="container-page py-8">
      <h1 className="font-display text-2xl text-ink">Offers</h1>
      <div className="mt-6 rounded-lg border border-dashed border-line-strong bg-card p-8 text-center">
        <p className="text-sm text-ink-2">
          Offer letter drafting lands next week. For now, move a candidate to the{' '}
          <span className="font-medium text-ink">Offered</span> stage from their role's
          Kanban, and generate the letter from the existing template manually.
        </p>
      </div>
    </div>
  )
}
