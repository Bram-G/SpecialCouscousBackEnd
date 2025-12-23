const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const bcrypt = require('bcrypt');
const { 
  User, 
  Group, 
  MovieMonday, 
  MovieSelection, 
  MovieMondayEventDetails,
  MovieCast,
  MovieCrew,
  WatchlistCategory,
  WatchlistItem,
  sequelize 
} = require('../models');
require('dotenv').config();

// First, check the database schema to ensure we're working with correct columns
async function checkDatabaseSchema() {
  try {
    console.log('Checking database schema...');
    
    // Get column info for MovieSelections table
    const [movieSelectionColumns] = await sequelize.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'MovieSelections';`
    );
    
    const columnNames = movieSelectionColumns.map(col => col.column_name);
    console.log('Available columns in MovieSelections:', columnNames);
    
    // Check for the presence of specific columns
    const hasGenres = columnNames.includes('genres');
    const hasReleaseYear = columnNames.includes('releaseYear');
    
    return {
      hasGenres,
      hasReleaseYear,
      availableColumns: columnNames
    };
  } catch (error) {
    console.error('Error checking database schema:', error);
    return {
      hasGenres: false,
      hasReleaseYear: false,
      availableColumns: []
    };
  }
}

const CSV_FILE_PATH = path.join(__dirname, '../../data/movie_monday_data.csv');

// Helper to create or get a user
async function getOrCreateUser(username, email, password) {
  try {
    // Check if user exists
    let user = await User.findOne({ where: { username } });
    
    if (!user) {
      console.log(`Creating user: ${username}`);
      const hashedPassword = await bcrypt.hash(password, 10);
      user = await User.create({
        username,
        email,
        password: hashedPassword
      });
    }
    
    return user;
  } catch (error) {
    console.error(`Error creating/finding user ${username}:`, error);
    throw error;
  }
}

// Convert MM/DD/YYYY to YYYY-MM-DD
function formatDate(dateStr) {
  const [month, day, year] = dateStr.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// Helper to fetch movie details from TMDB
async function fetchMovieDetails(tmdbId) {
  if (!tmdbId || isNaN(tmdbId)) {
    return null;
  }

  try {
    // Fetch movie details with credits (actors and crew)
    const url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${process.env.TMDB_API_KEY}&append_to_response=credits`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn(`Failed to fetch movie details for ID ${tmdbId}: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    return {
      tmdbMovieId: parseInt(tmdbId),
      title: data.title,
      posterPath: data.poster_path,
      genres: data.genres ? data.genres.map(g => g.name) : [],
      releaseYear: data.release_date ? parseInt(data.release_date.split('-')[0]) : null,
      // Add credits information for later use
      credits: data.credits || { cast: [], crew: [] }
    };
  } catch (error) {
    console.error(`Error fetching movie details for ID ${tmdbId}:`, error);
    // Return a basic object with just the ID if TMDB fetch fails
    return {
      tmdbMovieId: parseInt(tmdbId),
      title: `Movie ${tmdbId}`,
      posterPath: null,
      genres: [],
      releaseYear: null,
      credits: { cast: [], crew: [] }
    };
  }
}

// Helper function to create sample watchlists for Bram
async function createSampleWatchlists(bramUser) {
  console.log('\nCreating sample watchlists for Bram...');
  
  try {
    // Sample watchlist data
    const watchlistData = [
      {
        name: 'Classic Sci-Fi Collection',
        description: 'My favorite science fiction films of all time',
        isPublic: true,
        movies: [
          { tmdbId: 603, title: 'The Matrix' },
          { tmdbId: 78, title: 'Blade Runner' },
          { tmdbId: 62, title: '2001: A Space Odyssey' },
          { tmdbId: 271110, title: 'Arrival' },
          { tmdbId: 157336, title: 'Interstellar' }
        ]
      },
      {
        name: 'Want to Watch',
        description: 'Movies I need to see soon',
        isPublic: false,
        movies: [
          { tmdbId: 680, title: 'Pulp Fiction' },
          { tmdbId: 155, title: 'The Dark Knight' },
          { tmdbId: 13, title: 'Forrest Gump' },
          { tmdbId: 550, title: 'Fight Club' }
        ]
      },
      {
        name: 'Tarantino Marathon',
        description: 'Complete Quentin Tarantino filmography',
        isPublic: true,
        movies: [
          { tmdbId: 680, title: 'Pulp Fiction' },
          { tmdbId: 24, title: 'Kill Bill: Vol. 1' },
          { tmdbId: 393, title: 'Kill Bill: Vol. 2' },
          { tmdbId: 16869, title: 'Inglourious Basterds' },
          { tmdbId: 106646, title: 'Django Unchained' }
        ]
      }
    ];

    for (const watchlistInfo of watchlistData) {
      // Create the watchlist category
      const category = await WatchlistCategory.create({
        name: watchlistInfo.name,
        description: watchlistInfo.description,
        userId: bramUser.id,
        isPublic: watchlistInfo.isPublic,
        slug: watchlistInfo.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      });

      console.log(`  Created watchlist: ${watchlistInfo.name}`);

      // Add movies to the watchlist
      let sortOrder = 1;
      for (const movie of watchlistInfo.movies) {
        const movieDetails = await fetchMovieDetails(movie.tmdbId);
        
        if (movieDetails) {
          await WatchlistItem.create({
            categoryId: category.id,
            tmdbMovieId: movieDetails.tmdbMovieId,
            title: movieDetails.title,
            posterPath: movieDetails.posterPath,
            sortOrder: sortOrder++
          });
          console.log(`    Added movie: ${movieDetails.title}`);
        }
      }
    }

    console.log('✓ Sample watchlists created successfully!\n');
  } catch (error) {
    console.error('Error creating sample watchlists:', error);
  }
}

// Process CSV rows
async function processCSVData(csvData) {
  // Ensure schema info is available
  const schemaInfo = await checkDatabaseSchema();
  
  const parsedData = parse(csvData, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  console.log(`Parsed ${parsedData.length} rows from CSV`);
  
  // Create users with the same password
  const users = {
    Bram: await getOrCreateUser('Bram', 'bram.gibson@hotmail.com', 'password'),
    Syd: await getOrCreateUser('Syd', 'sydneykmartin1@gmail.com', 'password'),
    Tim: await getOrCreateUser('Tim', 'tim.bangssmhh@gmail.com', 'password'),
    Ellie: await getOrCreateUser('Ellie', 'elliemcummings98@gmail.com', 'password'),
    Austin: await getOrCreateUser('Austin', 'Austin@test.com', 'password'),
    Kyle: await getOrCreateUser('Kyle', 'Kyle@test.com', 'password')
  };

  // Create sample watchlists for Bram
  await createSampleWatchlists(users.Bram);

  // Create the Movie Monday group with public settings
  let group = await Group.findOne({ where: { name: 'Movie Monday' } });
  
  if (!group) {
    console.log('Creating Movie Monday group...');
    group = await Group.create({
      name: 'Movie Monday',
      createdById: users.Bram.id,
      isPublic: true, // Make the group public
      slug: 'movie-monday',
      description: 'Our weekly tradition of watching movies together. Every Monday we pick new films, enjoy themed drinks and food, and create lasting memories.'
    });
    
    // Add all users to the group
    await Promise.all(Object.values(users).map(user => 
      group.addUser(user.id)
    ));
    
    console.log('✓ Group created and made public!\n');
  } else {
    // Update existing group to be public if it isn't already
    if (!group.isPublic) {
      group.isPublic = true;
      group.slug = 'movie-monday';
      group.description = 'Our weekly tradition of watching movies together. Every Monday we pick new films, enjoy themed drinks and food, and create lasting memories.';
      await group.save();
      console.log('✓ Updated group to be public!\n');
    }
  }

  // Sample week themes to add variety
  const weekThemes = [
    '80s Action Night',
    'Rom-Com Marathon',
    'Sci-Fi Spectacular',
    'Horror Movie Night',
    'Classic Cinema',
    'Oscar Winners',
    'Director\'s Spotlight',
    'Summer Blockbusters',
    'Indie Film Night',
    'Holiday Special'
  ];

  // Process each row from the CSV
  for (const [index, row] of parsedData.entries()) {
    try {
      const formattedDate = formatDate(row.Date);
      
      // Determine picker (default to Bram if not specified or invalid)
      const pickerName = row.Picker && users[row.Picker] ? row.Picker : 'Bram';
      const pickerUserId = users[pickerName].id;
      
      console.log(`Processing MovieMonday for ${formattedDate}, picker: ${pickerName}`);
      
      // Randomly assign a theme to some weeks (about 30% of them)
      const shouldHaveTheme = Math.random() < 0.3;
      const weekTheme = shouldHaveTheme ? weekThemes[Math.floor(Math.random() * weekThemes.length)] : null;
      
      // Make most Movie Mondays public (about 80%)
      const isPublic = Math.random() < 0.8;
      
      // Create or update the MovieMonday
      const [movieMonday, created] = await MovieMonday.findOrCreate({
        where: { 
          date: formattedDate,
          GroupId: group.id
        },
        defaults: {
          pickerUserId,
          GroupId: group.id,
          status: 'completed',
          isPublic: isPublic,
          slug: `movie-monday-${formattedDate}`,
          weekTheme: weekTheme
        }
      });
      
      if (!created) {
        // Update existing movie monday
        movieMonday.pickerUserId = pickerUserId;
        movieMonday.isPublic = isPublic;
        movieMonday.slug = `movie-monday-${formattedDate}`;
        movieMonday.weekTheme = weekTheme;
        await movieMonday.save();
      }
      
      if (weekTheme) {
        console.log(`  Theme: ${weekTheme}`);
      }
      console.log(`  Public: ${isPublic ? 'Yes' : 'No'}`);

      // Create movie selections with better handling of blank/problematic values
      const movieIds = [
        { id: row['Winning TMDB ID'], title: row['Winning Movie'], isWinner: true },
        { id: row['Movie 2 TMDB ID'], title: row['Movie #2'], isWinner: false },
        { id: row['Movie 3 TMDB ID'], title: row['Movie #3'], isWinner: false }
      ].filter(movie => {
        // Filter out any empty, NaN, or "[ ]" values
        return movie.id && 
               !isNaN(Number(movie.id)) && 
               movie.id !== '[ ]' && 
               movie.title && 
               movie.title.trim() !== '' && 
               movie.title !== '[ ]';
      });

      // Delete existing movie selections if any
      await MovieSelection.destroy({
        where: { movieMondayId: movieMonday.id }
      });

      // Create new movie selections with TMDB data
      for (const movie of movieIds) {
        const movieDetails = await fetchMovieDetails(movie.id);
        
        if (movieDetails) {
          // Create a base movie selection object with only the guaranteed columns
          const movieSelectionData = {
            movieMondayId: movieMonday.id,
            tmdbMovieId: movieDetails.tmdbMovieId,
            title: movieDetails.title,
            posterPath: movieDetails.posterPath,
            isWinner: movie.isWinner
          };
          
          // Only add genres and releaseYear if they exist in the schema
          if (schemaInfo.hasGenres) {
            movieSelectionData.genres = movieDetails.genres;
          }
          
          if (schemaInfo.hasReleaseYear) {
            movieSelectionData.releaseYear = movieDetails.releaseYear;
          }
          
          // Create the movie selection
          const movieSelection = await MovieSelection.create(movieSelectionData);
          
          // Now add cast and crew information
          if (movieDetails.credits) {
            // Process top cast members (limit to 10)
            const topCast = movieDetails.credits.cast.slice(0, 10);
            for (const actor of topCast) {
              try {
                await MovieCast.create({
                  movieSelectionId: movieSelection.id,
                  actorId: actor.id,
                  name: actor.name,
                  character: actor.character || null,
                  profilePath: actor.profile_path || null,
                  order: actor.order || null
                });
              } catch (castError) {
                console.error(`Error adding cast member ${actor.name}:`, castError.message);
              }
            }
            
            // Process important crew members (directors, writers)
            const importantJobs = ["Director", "Screenplay", "Writer"];
            const keyCrew = movieDetails.credits.crew
              .filter(person => importantJobs.includes(person.job))
              .map(person => {
                // Normalize Writer and Screenplay roles to "Writer"
                if (person.job === "Screenplay") {
                  return { ...person, job: "Writer" };
                }
                return person;
              });
            
            // Remove duplicates (same person might have multiple roles)
            const uniqueCrew = [];
            const seenPersons = new Set();
            
            for (const person of keyCrew) {
              const key = `${person.id}-${person.job}`;
              if (!seenPersons.has(key)) {
                seenPersons.add(key);
                uniqueCrew.push(person);
              }
            }
            
            // Add crew members to database
            for (const person of uniqueCrew) {
              try {
                await MovieCrew.create({
                  movieSelectionId: movieSelection.id,
                  personId: person.id,
                  name: person.name,
                  job: person.job,
                  department: person.department || null,
                  profilePath: person.profile_path || null
                });
              } catch (crewError) {
                console.error(`Error adding crew member ${person.name}:`, crewError.message);
              }
            }
            
            console.log(`  Added ${topCast.length} cast and ${uniqueCrew.length} crew members to movie "${movieDetails.title}"`);
          }
        }
      }
      
      // Process event details (cocktails, dinner, dessert)
      const cocktails = row.Cocktail && row.Cocktail.trim() !== "" && row.Cocktail !== "[ ]" 
        ? row.Cocktail.split(',').map(c => c.trim()).filter(Boolean) 
        : [];
        
      const meals = row.Dinner && row.Dinner.trim() !== "" && row.Dinner !== "[ ]"
        ? [row.Dinner.trim()] 
        : [];
        
      const desserts = row.Dessert && row.Dessert.trim() !== "" && row.Dessert !== "[ ]"
        ? [row.Dessert.trim()] 
        : [];
      
      try {
        // Only create event details if we have actual data
        const hasData = cocktails.length > 0 || meals.length > 0 || desserts.length > 0;
        
        if (hasData) {
          // Create or update event details
          const [eventDetails, eventDetailsCreated] = await MovieMondayEventDetails.findOrCreate({
            where: { 
              movieMondayId: movieMonday.id 
            },
            defaults: {
              movieMondayId: movieMonday.id,
              cocktails: cocktails.length > 0 ? cocktails : [], 
              meals: meals.length > 0 ? meals : [],              
              desserts: desserts.length > 0 ? desserts : [],     
              notes: ""
            }
          });
          
          // If event details already existed, update them
          if (!eventDetailsCreated) {
            await eventDetails.update({
              cocktails: JSON.stringify(cocktails.length > 0 ? cocktails : []),
              meals: JSON.stringify(meals.length > 0 ? meals : []),
              desserts: JSON.stringify(desserts.length > 0 ? desserts : [])
            });
          }
          
          console.log(`  Event details ${eventDetailsCreated ? 'created' : 'updated'}`);
        }
      } catch (eventError) {
        console.error(`Error with event details:`, eventError.message);
      }
    } catch (error) {
      console.error(`Error processing row for date ${row.Date}:`, error);
      // Continue to the next row on error
    }
  }
}

// Main function to run the import
async function importMovieMondayData() {
  try {
    console.log('Starting Movie Monday data import...');
    console.log('=====================================\n');
    
    if (!fs.existsSync(CSV_FILE_PATH)) {
      console.error(`CSV file not found at path: ${CSV_FILE_PATH}`);
      return;
    }
    
    // Check database schema first
    const schemaInfo = await checkDatabaseSchema();
    global.schemaInfo = schemaInfo;
    
    console.log('Schema check result:');
    console.log(`- genres column exists: ${schemaInfo.hasGenres}`);
    console.log(`- releaseYear column exists: ${schemaInfo.hasReleaseYear}\n`);
    
    // Read CSV file
    const csvData = fs.readFileSync(CSV_FILE_PATH, 'utf-8');
    
    // Process the data
    await processCSVData(csvData);
    
    console.log('\n=====================================');
    console.log('✓ Data import completed successfully!');
    console.log('✓ Group is now public');
    console.log('✓ Most Movie Mondays are public');
    console.log('✓ Sample watchlists created for Bram');
    console.log('=====================================\n');
  } catch (error) {
    console.error('Error importing Movie Monday data:', error);
  } finally {
    // Close database connection
    await sequelize.close();
  }
}

// Run the import
importMovieMondayData();