/** OMS-R13 compatibility alias.
 * The legacy endpoint used unsafe raw-binary-as-text fallback and returned
 * form values that the browser applied without consent. Both are retired.
 *
 * This route now invokes the same authenticated, validated, read-only proposal
 * pipeline as /api/ai/order-intake. Consumers MUST show approval UI and call
 * the ordinary draft save; returned fields must never auto-write an order.
 */
export { POST } from '../../order-intake/+server';
