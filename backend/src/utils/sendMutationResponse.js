// Await the guarded operation, including its finally/lease cleanup, before
// sending headers. A following HTTP request must not race the previous lease.
export async function sendMutationResponse(res, mutation) {
  const { status = 200, body } = await mutation;
  return res.status(status).json(body);
}
