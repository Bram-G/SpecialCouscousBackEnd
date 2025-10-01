const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const statisticsModel = require("./statistics");
const Statistic = statisticsModel(sequelize);
const watchlistCategoryModel = require("./watchlistCategory");
const watchlistItemModel = require("./watchlistItem");
const watchlistLikeModel = require("./watchlistLike");
const WatchlistCategory = watchlistCategoryModel(sequelize);
const WatchlistItem = watchlistItemModel(sequelize);
const WatchlistLike = watchlistLikeModel(sequelize);

const User = sequelize.define("User", {
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true,
      len: [3, 30],
    },
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [6, 100],
    },
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  verificationToken: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  verificationTokenExpires: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  passwordResetToken: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  passwordResetExpires: {
    type: DataTypes.DATE,
    allowNull: true,
  },
});

const Group = sequelize.define("Group", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  createdById: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: "Users",
      key: "id",
    },
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  isPublic: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  slug: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  coverImagePath: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
});

const Movie = sequelize.define("Movie", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  imgLink: DataTypes.TEXT,
  actors: DataTypes.TEXT,
  rating: DataTypes.FLOAT,
  length: DataTypes.INTEGER,
  yearReleased: DataTypes.INTEGER,
  description: DataTypes.TEXT,
});

const MovieMondayEventDetails = sequelize.define("MovieMondayEventDetails", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  movieMondayId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: "MovieMondays",
      key: "id",
    },
  },
  cocktails: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const rawValue = this.getDataValue("cocktails");
      if (!rawValue) return [];

      try {
        // Parse JSON string to array
        const parsed = JSON.parse(rawValue);

        // Make sure it's an array and filter out any problematic values
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (item) =>
              item &&
              typeof item === "string" &&
              item.trim() !== "" &&
              item !== "[]" &&
              item !== "[ ]"
          );
        }

        // If not an array but valid content, return as single-item array
        if (parsed && typeof parsed === "string" && parsed.trim()) {
          return [parsed.trim()];
        }

        return [];
      } catch (e) {
        // If not valid JSON, treat as single string if it has content
        if (
          rawValue &&
          typeof rawValue === "string" &&
          rawValue.trim() !== "" &&
          rawValue !== "[]" &&
          rawValue !== "[ ]"
        ) {
          return [rawValue.trim()];
        }
        return [];
      }
    },
    set(val) {
      // Normalize the input
      let valueToStore = [];

      if (Array.isArray(val)) {
        // Filter out empty/null values and normalize strings
        valueToStore = val
          .filter((v) => v && typeof v === "string" && v.trim())
          .map((v) => v.trim());
      } else if (
        val &&
        typeof val === "string" &&
        val.trim() &&
        val !== "[]" &&
        val !== "[ ]"
      ) {
        valueToStore = [val.trim()];
      }

      this.setDataValue("cocktails", JSON.stringify(valueToStore));
    },
  },

  // Same pattern for meals
  meals: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const rawValue = this.getDataValue("meals");
      if (!rawValue) return [];

      try {
        const parsed = JSON.parse(rawValue);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (item) =>
              item &&
              typeof item === "string" &&
              item.trim() !== "" &&
              item !== "[]" &&
              item !== "[ ]"
          );
        }
        if (parsed && typeof parsed === "string" && parsed.trim()) {
          return [parsed.trim()];
        }
        return [];
      } catch (e) {
        if (
          rawValue &&
          typeof rawValue === "string" &&
          rawValue.trim() !== "" &&
          rawValue !== "[]" &&
          rawValue !== "[ ]"
        ) {
          return [rawValue.trim()];
        }
        return [];
      }
    },
    set(val) {
      let valueToStore = [];

      if (Array.isArray(val)) {
        valueToStore = val
          .filter((v) => v && typeof v === "string" && v.trim())
          .map((v) => v.trim());
      } else if (
        val &&
        typeof val === "string" &&
        val.trim() &&
        val !== "[]" &&
        val !== "[ ]"
      ) {
        valueToStore = [val.trim()];
      }

      this.setDataValue("meals", JSON.stringify(valueToStore));
    },
  },

  // Same pattern for desserts
  desserts: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const rawValue = this.getDataValue("desserts");
      if (!rawValue) return [];

      try {
        const parsed = JSON.parse(rawValue);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (item) =>
              item &&
              typeof item === "string" &&
              item.trim() !== "" &&
              item !== "[]" &&
              item !== "[ ]"
          );
        }
        if (parsed && typeof parsed === "string" && parsed.trim()) {
          return [parsed.trim()];
        }
        return [];
      } catch (e) {
        if (
          rawValue &&
          typeof rawValue === "string" &&
          rawValue.trim() !== "" &&
          rawValue !== "[]" &&
          rawValue !== "[ ]"
        ) {
          return [rawValue.trim()];
        }
        return [];
      }
    },
    set(val) {
      let valueToStore = [];

      if (Array.isArray(val)) {
        valueToStore = val
          .filter((v) => v && typeof v === "string" && v.trim())
          .map((v) => v.trim());
      } else if (
        val &&
        typeof val === "string" &&
        val.trim() &&
        val !== "[]" &&
        val !== "[ ]"
      ) {
        valueToStore = [val.trim()];
      }

      this.setDataValue("desserts", JSON.stringify(valueToStore));
    },
  },
});

const MovieMonday = sequelize.define(
  "MovieMonday",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    date: {
      type: DataTypes.DATEONLY, // Changed to match migration
      allowNull: false,
    },
    pickerUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "Users",
        key: "id",
      },
    },
    GroupId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "Groups",
        key: "id",
      },
    },
    status: {
      type: DataTypes.ENUM("pending", "in-progress", "completed"),
      defaultValue: "pending",
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING(150),
      allowNull: true,
      unique: true,
    },
    weekTheme: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    likesCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
  },
  {
    tableName: "MovieMondays",
  }
);

const MovieSelection = sequelize.define(
  "MovieSelection",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    movieMondayId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    tmdbMovieId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    posterPath: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    isWinner: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    genres: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const value = this.getDataValue("genres");
        return value ? JSON.parse(value) : [];
      },
      set(val) {
        this.setDataValue("genres", JSON.stringify(val));
      },
    },
    releaseYear: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: "MovieSelections", // Explicitly set table name
    timestamps: true,
  }
);

const MovieCast = sequelize.define(
  "MovieCast",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    movieSelectionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    actorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    character: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    profilePath: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    order: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: "MovieCast",
  }
);

const MovieCrew = sequelize.define(
  "MovieCrew",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    movieSelectionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    personId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    job: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    department: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    profilePath: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "MovieCrew",
  }
);
const CommentSection = sequelize.define(
  "CommentSection",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    contentType: {
      type: DataTypes.ENUM("movie", "watchlist", "moviemonday"),
      allowNull: false,
      validate: {
        isIn: [["movie", "watchlist", "moviemonday"]],
      },
    },
    contentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    totalComments: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
    },
  },
  {
    tableName: "CommentSections",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["contentType", "contentId"], // Unique combination of content type and ID
        name: "unique_content_comment_section",
      },
      {
        fields: ["contentType"], // Fast filtering by content type
      },
      {
        fields: ["contentId"], // Fast lookup by content ID
      },
    ],
  }
);

// 2. Comment Model - Supports threaded/nested comments (Reddit-style)
const Comment = sequelize.define(
  "Comment",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    commentSectionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "CommentSections",
        key: "id",
      },
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "Users",
        key: "id",
      },
    },
    parentCommentId: {
      type: DataTypes.INTEGER,
      allowNull: true, // null means it's a top-level comment
      references: {
        model: "Comments",
        key: "id",
      },
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [10, 1000], // Minimum 10 chars, max 1000 chars (anti-spam)
      },
    },
    voteScore: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    upvotes: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    downvotes: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    replyCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    depth: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      validate: {
        max: 5, // Maximum nesting depth of 5 levels
      },
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    isEdited: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    editedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    isHidden: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
  },
  {
    tableName: "Comments",
    timestamps: true,
    indexes: [
      {
        fields: ["commentSectionId"], // Fast lookup by section
      },
      {
        fields: ["userId"], // Fast lookup by user
      },
      {
        fields: ["parentCommentId"], // Fast lookup for replies
      },
      {
        fields: ["voteScore"], // Fast sorting by vote score
      },
      {
        fields: ["createdAt"], // Fast sorting by time
      },
      {
        fields: ["commentSectionId", "parentCommentId"], // Composite for top-level comments
      },
    ],
  }
);

// 3. CommentVote Model - Handles upvotes/downvotes
const CommentVote = sequelize.define(
  "CommentVote",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    commentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "Comments",
        key: "id",
      },
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "Users",
        key: "id",
      },
    },
    voteType: {
      type: DataTypes.ENUM("upvote", "downvote"),
      allowNull: false,
    },
  },
  {
    tableName: "CommentVotes",
    timestamps: true,
    updatedAt: false, // We don't need to track vote updates, just creation
    indexes: [
      {
        unique: true,
        fields: ["commentId", "userId"], // Prevent duplicate votes from same user
        name: "unique_user_comment_vote",
      },
      {
        fields: ["commentId"], // Fast lookup for vote counts
      },
      {
        fields: ["userId"], // Fast lookup for user's votes
      },
    ],
  }
);

// 4. CommentReport Model - For moderation (future-proofing)
const CommentReport = sequelize.define(
  "CommentReport",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    commentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "Comments",
        key: "id",
      },
    },
    reportedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "Users",
        key: "id",
      },
    },
    reason: {
      type: DataTypes.ENUM("spam", "harassment", "inappropriate", "other"),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isResolved: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    resolvedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "Users",
        key: "id",
      },
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "CommentReports",
    timestamps: true,
    indexes: [
      {
        fields: ["commentId"],
      },
      {
        fields: ["reportedByUserId"],
      },
      {
        fields: ["isResolved"],
      },
    ],
  }
);
const MovieMondayLike = sequelize.define(
  "MovieMondayLike",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    movieMondayId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "MovieMondays",
        key: "id",
      },
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "Users",
        key: "id",
      },
    },
  },
  {
    tableName: "MovieMondayLikes",
    timestamps: true,
    updatedAt: false,
    indexes: [
      {
        unique: true,
        fields: ["movieMondayId", "userId"],
        name: "unique_user_moviemonday_like",
      },
    ],
  }
);

// Group-User many-to-many relationship
User.belongsToMany(Group, { through: "GroupMembers" });
Group.belongsToMany(User, { through: "GroupMembers" });

// MovieMonday relationships
MovieMonday.belongsTo(Group, {
  foreignKey: {
    allowNull: false,
  },
  onDelete: "CASCADE",
});

MovieMonday.belongsTo(User, {
  foreignKey: "pickerUserId",
  as: "picker",
});

// MovieSelection relationships
MovieMonday.hasMany(MovieSelection, {
  foreignKey: "movieMondayId",
  as: "movieSelections",
});
MovieSelection.belongsTo(MovieMonday, {
  foreignKey: "movieMondayId",
});

MovieMonday.hasOne(MovieMondayEventDetails, {
  foreignKey: "movieMondayId",
  as: "eventDetails",
});

MovieMondayEventDetails.belongsTo(MovieMonday, {
  foreignKey: "movieMondayId",
});

// Cast relationships
MovieSelection.hasMany(MovieCast, {
  foreignKey: "movieSelectionId",
  as: "cast",
});
MovieCast.belongsTo(MovieSelection, {
  foreignKey: "movieSelectionId",
});

MovieSelection.hasMany(MovieCrew, {
  foreignKey: "movieSelectionId",
  as: "crew",
});
MovieCrew.belongsTo(MovieSelection, {
  foreignKey: "movieSelectionId",
});

// User-WatchlistCategory relationship (one-to-many)
User.hasMany(WatchlistCategory, {
  foreignKey: "userId",
  as: "watchlistCategories",
});
WatchlistCategory.belongsTo(User, {
  foreignKey: "userId",
});

// WatchlistCategory-WatchlistItem relationship (one-to-many)
WatchlistCategory.hasMany(WatchlistItem, {
  foreignKey: "categoryId",
  as: "items",
});
WatchlistItem.belongsTo(WatchlistCategory, {
  foreignKey: "categoryId",
});

// WatchlistCategory-WatchlistLike relationship (one-to-many)
WatchlistCategory.hasMany(WatchlistLike, {
  foreignKey: "watchlistCategoryId",
  as: "likes",
});
WatchlistLike.belongsTo(WatchlistCategory, {
  foreignKey: "watchlistCategoryId",
});

// User-WatchlistLike relationship (one-to-many)
User.hasMany(WatchlistLike, {
  foreignKey: "userId",
  as: "watchlistLikes",
});
WatchlistLike.belongsTo(User, {
  foreignKey: "userId",
});
// CommentSection associations
CommentSection.hasMany(Comment, {
  foreignKey: "commentSectionId",
  as: "comments",
  onDelete: "CASCADE",
});
Comment.belongsTo(CommentSection, {
  foreignKey: "commentSectionId",
});

// User-Comment relationship (one-to-many)
User.hasMany(Comment, {
  foreignKey: "userId",
  as: "comments",
});
Comment.belongsTo(User, {
  foreignKey: "userId",
  as: "author",
});

// Self-referencing relationship for threaded comments
Comment.hasMany(Comment, {
  foreignKey: "parentCommentId",
  as: "replies",
});
Comment.belongsTo(Comment, {
  foreignKey: "parentCommentId",
  as: "parentComment",
});

// Comment-CommentVote relationship (one-to-many)
Comment.hasMany(CommentVote, {
  foreignKey: "commentId",
  as: "votes",
  onDelete: "CASCADE",
});
CommentVote.belongsTo(Comment, {
  foreignKey: "commentId",
});

// User-CommentVote relationship (one-to-many)
User.hasMany(CommentVote, {
  foreignKey: "userId",
  as: "commentVotes",
});
CommentVote.belongsTo(User, {
  foreignKey: "userId",
  as: "voter",
});

// Comment-CommentReport relationship (one-to-many)
Comment.hasMany(CommentReport, {
  foreignKey: "commentId",
  as: "reports",
});
CommentReport.belongsTo(Comment, {
  foreignKey: "commentId",
});

// User-CommentReport relationships
User.hasMany(CommentReport, {
  foreignKey: "reportedByUserId",
  as: "reportsMade",
});
CommentReport.belongsTo(User, {
  foreignKey: "reportedByUserId",
  as: "reporter",
});

User.hasMany(CommentReport, {
  foreignKey: "resolvedByUserId",
  as: "reportsResolved",
});
CommentReport.belongsTo(User, {
  foreignKey: "resolvedByUserId",
  as: "resolver",
});
MovieMonday.hasMany(MovieMondayLike, { foreignKey: "movieMondayId" });
MovieMondayLike.belongsTo(MovieMonday, { foreignKey: "movieMondayId" });
User.hasMany(MovieMondayLike, { foreignKey: "userId" });
MovieMondayLike.belongsTo(User, { foreignKey: "userId" });

module.exports = {
  MovieMonday,
  MovieSelection,
  MovieCast,
  MovieCrew,
  User,
  Group,
  Movie,
  sequelize,
  MovieMondayEventDetails,
  WatchlistCategory,
  WatchlistItem,
  WatchlistLike,
  Statistic,
  CommentSection,
  Comment,
  CommentVote,
  CommentReport,
};
