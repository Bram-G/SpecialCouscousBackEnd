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
      model: 'Users',
      key: 'id'
    }
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  }
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
    allowNull: true
  },
  cocktails: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const rawValue = this.getDataValue('cocktails');
      return rawValue ? rawValue.split(',').map(item => item.trim()) : [];
    },
    set(val) {
      if (Array.isArray(val)) {
        this.setDataValue('cocktails', val.join(','));
      } else {
        this.setDataValue('cocktails', val);
      }
    }
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
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
  GroupId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  status: {
    type: DataTypes.STRING, 
    defaultValue: 'pending',
    validate: {
      isIn: [['pending', 'in-progress', 'completed']]
    }
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
  tableName: 'WatchLater'  // Changed from 'WatchLaters'
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

MovieMonday.hasOne(MovieMondayEventDetails, {
  foreignKey: 'movieMondayId',
  as: 'eventDetails'
});

MovieMondayEventDetails.belongsTo(MovieMonday, {
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
  sequelize,
  MovieMondayEventDetails,
};
