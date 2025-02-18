const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

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
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
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

const GroupInvite = sequelize.define("GroupInvite", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  status: {
    type: DataTypes.ENUM("pending", "accepted", "rejected"),
    defaultValue: "pending",
  },
  expiresAt: {
    type: DataTypes.DATE,
  },
});

const MovieMonday = sequelize.define('MovieMonday', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  pickerUserId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  GroupId: {  // Note the capital G
    type: DataTypes.INTEGER,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('not_created', 'pending', 'in-progress', 'completed'),
    defaultValue: 'pending'
  }
}, {
  tableName: 'MovieMondays'
});

const MovieSelection = sequelize.define('MovieSelection', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  movieMondayId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  tmdbMovieId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  posterPath: {
    type: DataTypes.STRING,
    allowNull: true
  },
  isWinner: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'MovieSelections', // Explicitly set table name
  timestamps: true
});

const WatchLater = sequelize.define('WatchLater', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  tmdbMovieId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  posterPath: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'WatchLaters', // Explicitly set table name
  timestamps: true
});


// Group Invite relationships
GroupInvite.belongsTo(User, { as: "invitedBy" });
GroupInvite.belongsTo(User, { as: "invitedUser" });
GroupInvite.belongsTo(Group);

// Group relationships
Group.belongsTo(User, {
  as: "createdBy",
  foreignKey: {
    allowNull: false,
  },
});

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
  foreignKey: 'pickerUserId',
  as: 'picker'
});

// MovieSelection relationships (remove the belongsToMany and use hasMany/belongsTo)
MovieMonday.hasMany(MovieSelection, {
  foreignKey: 'movieMondayId',
  as: 'movieSelections'
});
MovieSelection.belongsTo(MovieMonday, {
  foreignKey: 'movieMondayId'
});

// WatchLater relationships
User.hasMany(WatchLater, {
  foreignKey: 'userId',
  as: 'watchLaterMovies'
});
WatchLater.belongsTo(User, {
  foreignKey: 'userId'
});

module.exports = {
  MovieMonday,
  MovieSelection,
  User,
  WatchLater,
  Group,
  Movie,
  GroupInvite,
  sequelize,
};
