import {
  getUserSnapshot,
  listProviderMetadata,
  purchaseCredits
} from "../services/roundtableService.js";

export function getCredits(req, res) {
  const snapshot = getUserSnapshot(req.user.clerk_id);
  return res.json({
    user: snapshot.user,
    providers: listProviderMetadata()
  });
}

export function purchase(req, res) {
  const { amount = 10, credits = 25 } = req.body;
  const user = purchaseCredits(req.user.clerk_id, amount, credits);
  return res.json({
    message: "Credits added successfully.",
    user
  });
}
