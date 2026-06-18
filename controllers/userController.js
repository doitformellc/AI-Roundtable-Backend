import {
  getUserSnapshot,
  listProviderMetadata,
  purchaseCredits
} from "../services/roundtableService.js";

export async function getCredits(req, res) {
  try {
    const snapshot = await getUserSnapshot(req.user.clerk_id);
    return res.json({
      user: snapshot.user,
      providers: listProviderMetadata()
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

export async function purchase(req, res) {
  const { amount = 10, credits = 25 } = req.body;
  try {
    const user = await purchaseCredits(req.user.clerk_id, amount, credits);
    return res.json({
      message: "Credits added successfully.",
      user
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
