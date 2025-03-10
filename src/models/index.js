const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const statisticsModel = require('./statistics');
const Statistic = statisticsModel(sequelize);

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
    defaultValue: false
  },
  verificationToken: {
    type: DataTypes.STRING,
    allowNull: true
  },
  verificationTokenExpires: {
    type: DataTypes.DATE,
    allowNull: true
  },
  passwordResetToken: {
    type: DataTypes.STRING,
    allowNull: true
  },
  passwordResetExpires: {
    type: DataTypes.DATE,
    allowNull: true
  }
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
  cocktails: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const rawValue = this.getDataValue('cocktails');
      if (!rawValue) return [];
      
      try {
        // Parse JSON string to array
        const parsed = JSON.parse(rawValue);
        
        // Make sure it's an array and filter out any problematic values
        if (Array.isArray(parsed)) {
          return parsed.filter(item => 
            item && 
            typeof item === 'string' && 
            item.trim() !== '' &&
            item !== '[]' &&
            item !== '[ ]'
          );
        }
        
        // If not an array but valid content, return as single-item array
        if (parsed && typeof parsed === 'string' && parsed.trim()) {
          return [parsed.trim()];
        }
        
        return [];
      } catch (e) {
        // If not valid JSON, treat as single string if it has content
        if (rawValue && typeof rawValue === 'string' && rawValue.trim() !== '' && 
            rawValue !== '[]' && rawValue !== '[ ]') {
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
        valueToStore = val.filter(v => v && typeof v === 'string' && v.trim())
          .map(v => v.trim());
      } else if (val && typeof val === 'string' && val.trim() && val !== '[]' && val !== '[ ]') {
        valueToStore = [val.trim()];
      }
      
      this.setDataValue('cocktails', JSON.stringify(valueToStore));
    }
  },
  
  // Same pattern for meals
  meals: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const rawValue = this.getDataValue('meals');
      if (!rawValue) return [];
      
      try {
        const parsed = JSON.parse(rawValue);
        if (Array.isArray(parsed)) {
          return parsed.filter(item => 
            item && 
            typeof item === 'string' && 
            item.trim() !== '' &&
            item !== '[]' &&
            item !== '[ ]'
          );
        }
        if (parsed && typeof parsed === 'string' && parsed.trim()) {
          return [parsed.trim()];
        }
        return [];
      } catch (e) {
        if (rawValue && typeof rawValue === 'string' && rawValue.trim() !== '' && 
            rawValue !== '[]' && rawValue !== '[ ]') {
          return [rawValue.trim()];
        }
        return [];
      }
    },
    set(val) {
      let valueToStore = [];
      
      if (Array.isArray(val)) {
        valueToStore = val.filter(v => v && typeof v === 'string' && v.trim())
          .map(v => v.trim());
      } else if (val && typeof val === 'string' && val.trim() && val !== '[]' && val !== '[ ]') {
        valueToStore = [val.trim()];
      }
      
      this.setDataValue('meals', JSON.stringify(valueToStore));
    }
  },
  
  // Same pattern for desserts
  desserts: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const rawValue = this.getDataValue('desserts');
      if (!rawValue) return [];
      
      try {
        const parsed = JSON.parse(rawValue);
        if (Array.isArray(parsed)) {
          return parsed.filter(item => 
            item && 
            typeof item === 'string' && 
            item.trim() !== '' &&
            item !== '[]' &&
            item !== '[ ]'
          );
        }
        if (parsed && typeof parsed === 'string' && parsed.trim()) {
          return [parsed.trim()];
        }
        return [];
      } catch (e) {
        if (rawValue && typeof rawValue === 'string' && rawValue.trim() !== '' && 
            rawValue !== '[]' && rawValue !== '[ ]') {
          return [rawValue.trim()];
        }
        return [];
      }
    },
    set(val) {
      let valueToStore = [];
      
      if (Array.isArray(val)) {
        valueToStore = val.filter(v => v && typeof v === 'string' && v.trim())
          .map(v => v.trim());
      } else if (val && typeof val === 'string' && val.trim() && val !== '[]' && val !== '[ ]') {
        valueToStore = [val.trim()];
      }
      
      this.setDataValue('desserts', JSON.stringify(valueToStore));
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
