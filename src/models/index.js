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

const MovieMondayEventDetails = sequelize.define('MovieMondayEventDetails', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  movieMondayId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'MovieMondays',
      key: 'id'
    }
  },
  meals: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const rawValue = this.getDataValue('meals');
      if (!rawValue) return [];
      
      try {
        // Try to parse as JSON first
        return JSON.parse(rawValue);
      } catch (e) {
        // If not valid JSON, treat as string and return as single-item array
        return [rawValue];
      }
    },
    set(val) {
      if (Array.isArray(val)) {
        this.setDataValue('meals', JSON.stringify(val));
      } else if (typeof val === 'string') {
        this.setDataValue('meals', JSON.stringify([val]));
      } else {
        this.setDataValue('meals', JSON.stringify([]));
      }
    }
  },
  
  // Similar for desserts
  desserts: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const rawValue = this.getDataValue('desserts');
      if (!rawValue) return [];
      
      try {
        return JSON.parse(rawValue);
      } catch (e) {
        return [rawValue];
      }
    },
    set(val) {
      if (Array.isArray(val)) {
        this.setDataValue('desserts', JSON.stringify(val));
      } else if (typeof val === 'string') {
        this.setDataValue('desserts', JSON.stringify([val]));
      } else {
        this.setDataValue('desserts', JSON.stringify([]));
      }
    }
  },
  
  // Ensure cocktails follows same pattern
  cocktails: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const rawValue = this.getDataValue('cocktails');
      if (!rawValue) return [];
      
      try {
        return JSON.parse(rawValue);
      } catch (e) {
        return [rawValue];
      }
    },
    set(val) {
      if (Array.isArray(val)) {
        this.setDataValue('cocktails', JSON.stringify(val));
      } else if (typeof val === 'string') {
        this.setDataValue('cocktails', JSON.stringify([val]));
      } else {
        this.setDataValue('cocktails', JSON.stringify([]));
      }
    }
  }
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

const WatchLater = sequelize.define(
  "WatchLater",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
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
  },
  {
    tableName: "WatchLater", // Changed from 'WatchLaters'
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

// MovieSelection relationships (remove the belongsToMany and use hasMany/belongsTo)
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

// WatchLater relationships
User.hasMany(WatchLater, {
  foreignKey: "userId",
  as: "watchLaterMovies",
});
WatchLater.belongsTo(User, {
  foreignKey: "userId",
});

//Cast relationships
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

module.exports = {
  MovieMonday,
  MovieSelection,
  MovieCast,
  MovieCrew,
  User,
  WatchLater,
  Group,
  Movie,
  sequelize,
  MovieMondayEventDetails,
};
