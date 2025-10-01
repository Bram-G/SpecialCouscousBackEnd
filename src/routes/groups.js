const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { User, Group, GroupInvite } = require("../models");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = process.env;

// Get user's group
router.get("/users/group", auth, async (req, res) => {
  try {
    const user = req.user;
    // console.log('User from auth middleware:', user);
    const userWithGroup = await User.findOne({
      where: { id: user.id },
      include: [
        {
          model: Group,
          include: [
            {
              model: User,
              attributes: ["id", "username", "email"],
            },
          ],
        },
      ],
    });

    // console.log('User with group:', userWithGroup);

    if (!userWithGroup?.Groups?.length) {
      return res.json(null);
    }

    const group = userWithGroup.Groups[0];
    return res.json({
      id: group.id,
      name: group.name,
      createdById: group.createdById,
      members: group.Users,
      createdAt: group.createdAt,
    });
  } catch (error) {
    console.error("Error fetching user group:", error);
    res.status(500).json({ error: "Failed to fetch group" });
  }
});
//Leave Group
router.post("/groups/:groupId/leave", auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    const group = await Group.findByPk(groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Don't allow the group creator to leave
    if (group.createdById === userId) {
      return res
        .status(400)
        .json({ error: "Group owner cannot leave the group" });
    }

    // Remove user from group
    await group.removeUser(userId);

    res.json({ message: "Successfully left group" });
  } catch (error) {
    console.error("Error leaving group:", error);
    res.status(500).json({ error: "Failed to leave group" });
  }
});
// Remove user from group (only group owner can do this)
router.delete("/groups/:groupId/members/:userId", auth, async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    const currentUserId = req.user.id;

    const group = await Group.findByPk(groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if current user is the group owner
    if (group.createdById !== currentUserId) {
      return res
        .status(403)
        .json({ error: "Only group owner can remove members" });
    }

    // Don't allow removing the owner
    if (parseInt(userId) === group.createdById) {
      return res.status(400).json({ error: "Cannot remove group owner" });
    }

    // Remove user from group
    await group.removeUser(userId);

    res.json({ message: "Successfully removed user from group" });
  } catch (error) {
    console.error("Error removing user from group:", error);
    res.status(500).json({ error: "Failed to remove user from group" });
  }
});
// Create a group
router.post("/groups", auth, async (req, res) => {
  try {
    const { name } = req.body;
    const group = await Group.create({
      name,
      createdById: req.user.id,
    });

    // Add creator as first member
    await group.addUser(req.user.id);

    // Fetch the complete group with members
    const groupWithMembers = await Group.findOne({
      where: { id: group.id },
      include: [
        {
          model: User,
          attributes: ["id", "username", "email"],
        },
      ],
    });

    res.json({
      id: groupWithMembers.id,
      name: groupWithMembers.name,
      createdById: groupWithMembers.createdById,
      members: groupWithMembers.Users,
    });
  } catch (error) {
    console.error("Error creating group:", error);
    res.status(500).json({ error: "Failed to create group" });
  }
});
// Create group invite
router.post("/groups/:groupId/invite-link", auth, async (req, res) => {
  try {
    const { groupId } = req.params;

    // Verify user is in group
    const group = await Group.findOne({
      where: { id: groupId },
      include: [
        {
          model: User,
          where: { id: req.user.id },
        },
      ],
    });

    if (!group) {
      return res
        .status(403)
        .json({ error: "Not authorized to create invite link for this group" });
    }
    // Generate invite token that expires in 7 days
    const inviteToken = jwt.sign(
      {
        type: "group-invite",
        groupId: group.id,
        groupName: group.name,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      inviteToken,
      inviteLink: `${process.env.FRONTEND_URL}/groups/join/${inviteToken}`,
    });
  } catch (error) {
    console.error("Error generating invite link:", error);
    res.status(500).json({ error: "Failed to generate invite link" });
  }
});

// Verify and join group via invite link
// Get group info from invite token
router.get("/groups/join/:inviteToken", auth, async (req, res) => {
  try {
    const { inviteToken } = req.params;

    // Verify token
    const decoded = jwt.verify(inviteToken, JWT_SECRET);
    if (decoded.type !== "group-invite") {
      return res.status(400).json({ error: "Invalid invite link" });
    }

    const group = await Group.findByPk(decoded.groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Return group info
    res.json({
      name: group.name,
      id: group.id,
    });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(400).json({ error: "Invite link has expired" });
    }
    console.error("Error verifying invite:", error);
    res.status(500).json({ error: "Failed to verify invite" });
  }
});

// Join group via invite link
router.post("/groups/join/:inviteToken", auth, async (req, res) => {
  try {
    const { inviteToken } = req.params;

    // Verify token
    const decoded = jwt.verify(inviteToken, JWT_SECRET);
    if (decoded.type !== "group-invite") {
      return res.status(400).json({ error: "Invalid invite link" });
    }

    const group = await Group.findByPk(decoded.groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if user is already in group
    const existingMember = await group.hasUser(req.user.id);
    if (existingMember) {
      return res.status(400).json({ error: "Already a member of this group" });
    }

    // Add user to group
    await group.addUser(req.user.id);

    // Return updated group data
    const updatedGroup = await Group.findOne({
      where: { id: group.id },
      include: [
        {
          model: User,
          attributes: ["id", "username", "email"],
        },
      ],
    });

    res.json({
      id: updatedGroup.id,
      name: updatedGroup.name,
      createdById: updatedGroup.createdById,
      members: updatedGroup.Users,
    });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(400).json({ error: "Invite link has expired" });
    }
    console.error("Error joining group:", error);
    res.status(500).json({ error: "Failed to join group" });
  }
});

router.post("/groups/:groupId/invites", auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { invitedUserEmail } = req.body;

    // Check if user is member of the group
    const group = await Group.findOne({
      where: { id: groupId },
      include: [
        {
          model: User,
          where: { id: req.user.id },
        },
      ],
    });

    if (!group) {
      return res
        .status(403)
        .json({ error: "Not authorized to invite to this group" });
    }

    const invitedUser = await User.findOne({
      where: { email: invitedUserEmail },
    });
    if (!invitedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check for existing invite
    const existingInvite = await GroupInvite.findOne({
      where: {
        groupId,
        invitedUserId: invitedUser.id,
        status: "pending",
      },
    });

    if (existingInvite) {
      return res.status(400).json({ error: "Invite already exists" });
    }

    const invite = await GroupInvite.create({
      invitedById: req.user.id,
      invitedUserId: invitedUser.id,
      groupId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    res.json(invite);
  } catch (error) {
    console.error("Error creating invite:", error);
    res.status(500).json({ error: "Failed to create invite" });
  }
});

router.patch("/groups/:groupId/visibility", auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { isPublic, description, coverImagePath } = req.body;

    const group = await Group.findByPk(groupId);

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Only group owner can change visibility
    if (group.createdById !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Only group owner can change visibility" });
    }

    // Generate slug if making public and doesn't have one
    if (isPublic && !group.slug) {
      const baseSlug = group.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      // Ensure slug is unique
      let slug = baseSlug;
      let counter = 1;
      while (await Group.findOne({ where: { slug } })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
      group.slug = slug;
    }

    if (isPublic !== undefined) group.isPublic = isPublic;
    if (description !== undefined) group.description = description;
    if (coverImagePath !== undefined) group.coverImagePath = coverImagePath;

    await group.save();

    res.json(group);
  } catch (error) {
    console.error("Error updating group visibility:", error);
    res.status(500).json({ error: "Failed to update group visibility" });
  }
});

// Get public group by slug
router.get("/groups/public/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    const group = await Group.findOne({
      where: { slug, isPublic: true },
      include: [
        {
          model: User,
          attributes: ["id", "username"],
        },
      ],
    });

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    res.json(group);
  } catch (error) {
    console.error("Error fetching public group:", error);
    res.status(500).json({ error: "Failed to fetch group" });
  }
});

module.exports = router;
