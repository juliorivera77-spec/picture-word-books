// Books written for this app: classic tales retold in short, literal sentences, traditional
// (public-domain) nursery rhymes, everyday social stories and very short "first words" books.
// Pages are separated by a blank line.

export interface WrittenBook {
  id: string;
  title: string;
  kind: 'story' | 'social' | 'rhyme' | 'first';
  level: 1 | 2 | 3;
  description: string;
  text: string;
  /** Pictures for names and sounds: word or phrase → word to look up ("-" = no picture). */
  hints?: Record<string, string>;
}

const RETOLD = 'Retold for Picture Word Books from a traditional tale (public domain).';

export const WRITTEN: (WrittenBook & { credit: string })[] = [
  // ---------- first words ----------
  {
    id: 'w-i-see',
    title: 'I See',
    kind: 'first',
    level: 1,
    description: 'One new thing on every page.',
    credit: 'Written for Picture Word Books.',
    text: `I see a cat.

I see a dog.

I see a bird.

I see a fish.

I see a ball.

I see my mom.`,
  },
  {
    id: 'w-i-like',
    title: 'I Like',
    kind: 'first',
    level: 1,
    description: 'Things to eat and things to do.',
    credit: 'Written for Picture Word Books.',
    text: `I like apples.

I like milk.

I like to jump.

I like to swim.

I like books.

I like you!`,
  },
  {
    id: 'w-colours',
    title: 'Colors',
    kind: 'first',
    level: 1,
    description: 'Learn the colors.',
    credit: 'Written for Picture Word Books.',
    text: `The apple is red.

The sun is yellow.

The tree is green.

The sky is blue.

The cat is black.

The snow is white.`,
  },
  {
    id: 'w-my-day',
    title: 'My Day',
    kind: 'first',
    level: 1,
    description: 'From waking up to going to bed.',
    credit: 'Written for Picture Word Books.',
    text: `I wake up.

I eat.

I go to school.

I play.

I go home.

I go to sleep.`,
  },
  {
    id: 'w-animals',
    title: 'What Do Animals Say?',
    kind: 'first',
    level: 1,
    description: 'Animal sounds to say together.',
    credit: 'Written for Picture Word Books.',
    hints: { woof: 'dog', meow: 'cat', moo: 'cow', quack: 'duck', baa: 'sheep' },
    text: `The dog says woof.

The cat says meow.

The cow says moo.

The duck says quack.

The sheep says baa.

What do you say?`,
  },

  // ---------- classic tales, retold ----------
  {
    id: 'w-three-little-pigs',
    title: 'The Three Little Pigs',
    kind: 'story',
    level: 2,
    description: 'Three pigs build three houses. Which house is strong?',
    credit: RETOLD,
    text: `Three little pigs go to make a house.

The first pig makes a house of straw.

The second pig makes a house of sticks.

The third pig makes a house of bricks.

A big bad wolf comes.
He blows the straw house down!
The pig runs to his brother.

The wolf blows the stick house down!
The two pigs run to the brick house.

The wolf blows and blows.
The brick house does not fall down.

The wolf goes away.
The three pigs are happy and safe.`,
  },
  {
    id: 'w-goldilocks',
    title: 'Goldilocks and the Three Bears',
    kind: 'story',
    level: 2,
    description: 'A girl visits the home of three bears.',
    credit: RETOLD,
    hints: { goldilocks: 'girl' },
    text: `Three bears live in a house in the woods.
There is a dad bear, a mom bear and a baby bear.

A girl called Goldilocks walks into the house.

She sees three bowls of food.
The big bowl is too hot.
The middle bowl is too cold.
The little bowl is just right. She eats it all!

She sees three chairs.
The little chair is just right.
Oh no! The chair breaks.

She sees three beds.
The little bed is just right.
Goldilocks goes to sleep.

The three bears come home.
"Someone ate my food!" says baby bear.

Baby bear sees Goldilocks in his bed.
Goldilocks wakes up. She runs home!`,
  },
  {
    id: 'w-little-red-hen',
    title: 'The Little Red Hen',
    kind: 'story',
    level: 2,
    description: 'Who will help the hen make bread?',
    credit: RETOLD,
    text: `The little red hen finds some seeds.
"Who will help me plant the seeds?"

"Not me," says the dog.
"Not me," says the cat.
"Not me," says the duck.
"Then I will do it myself," says the hen.

The seeds grow into wheat.
"Who will help me cut the wheat?"
"Not me," say the dog, the cat and the duck.

The hen cuts the wheat.
She makes flour.
"Who will help me make the bread?"
"Not me," they say.

The hen makes the bread.
It smells good!
"Who will help me eat the bread?"

"I will!" says the dog.
"I will!" says the cat.
"I will!" says the duck.

"No," says the little red hen.
"I will eat it myself."
And she does!`,
  },
  {
    id: 'w-gingerbread-man',
    title: 'The Gingerbread Man',
    kind: 'story',
    level: 2,
    description: 'Run, run, as fast as you can!',
    credit: RETOLD,
    hints: { 'gingerbread man': 'boy', snap: 'bite' },
    text: `A woman makes a gingerbread man.
She opens the oven. He jumps out!

"Run, run, as fast as you can!
You can't catch me, I'm the gingerbread man!"

The woman runs after him.
The man runs after him.
They cannot catch him.

A cow runs after him.
A horse runs after him.
They cannot catch him.

He comes to a river.
He cannot swim.

A fox says, "Jump on my back. I will help you."

The fox swims.
"Jump on my nose," says the fox.

Snap! The fox eats the gingerbread man.
That is the end of the gingerbread man.`,
  },
  {
    id: 'w-tortoise-hare',
    title: 'The Tortoise and the Hare',
    kind: 'story',
    level: 2,
    description: 'Slow and steady wins the race.',
    credit: RETOLD,
    text: `The hare is very fast.
The tortoise is very slow.

"Let's have a race," says the tortoise.
The hare laughs. "I will win!"

Go! The hare runs fast.
The tortoise walks slowly.

The hare looks back. The tortoise is far away.
"I have time for a nap," says the hare.
He goes to sleep under a tree.

The tortoise walks and walks.
He does not stop.

The tortoise walks past the hare.
The hare is still asleep.

The hare wakes up. He runs very fast.
But the tortoise is at the end. The tortoise wins!

Slow and steady wins the race.`,
  },
  {
    id: 'w-red-riding-hood',
    title: 'Little Red Riding Hood',
    kind: 'story',
    level: 3,
    description: 'A girl takes food to her grandma. Who is in grandma’s bed?',
    credit: RETOLD,
    hints: { 'little red riding hood': 'girl', woodcutter: 'man' },
    text: `A girl has a red coat with a hood.
Her name is Little Red Riding Hood.

Her mom gives her a basket of food.
"Take this to Grandma. Stay on the path."

In the woods, she meets a wolf.
"Where are you going?" asks the wolf.
"To my grandma's house," says the girl.

The wolf runs to Grandma's house first.
Grandma hides in the closet.
The wolf gets into Grandma's bed.

Little Red Riding Hood comes in.
"Grandma, what big eyes you have!"
"All the better to see you with."

"Grandma, what big ears you have!"
"All the better to hear you with."

"Grandma, what big teeth you have!"
"All the better to eat you with!"

The girl shouts for help.
A woodcutter comes in.
The wolf runs away into the woods.

Grandma comes out of the closet.
They hug. They eat the food together.`,
  },
  {
    id: 'w-ugly-duckling',
    title: 'The Ugly Duckling',
    kind: 'story',
    level: 3,
    description: 'A little bird who is different grows up to be a swan.',
    credit: 'Retold for Picture Word Books from the tale by Hans Christian Andersen (public domain).',
    text: `A mother duck sits on her eggs.
Crack! Crack! Out come the baby ducks.

One egg is big.
Out comes a big gray bird.
He does not look like the other ducks.

The other ducks laugh at him.
"You are ugly," they say.
He is sad.

The gray bird goes away.
He is alone. He is cold in the winter.

Spring comes. The sun is warm.
He sees beautiful white birds on the lake.

He looks in the water.
He sees a beautiful white bird too.
It is him! He is a swan!

The other swans swim to him.
"Come and swim with us," they say.
He is happy at last.`,
  },
  {
    id: 'w-lion-mouse',
    title: 'The Lion and the Mouse',
    kind: 'story',
    level: 2,
    description: 'A little friend can be a big help.',
    credit: 'Retold for Picture Word Books from Aesop’s fable (public domain).',
    text: `A big lion is asleep.
A little mouse runs on him.

The lion wakes up. He catches the mouse.
"Please let me go," says the mouse.
"One day I will help you."

The lion laughs. "How can you help me? You are so small!"
But he lets the mouse go.

One day the lion is caught in a net.
He cannot get out.
He roars and roars.

The mouse hears him.
She runs to the lion.

The mouse bites the net with her teeth.
Bite, bite, bite!

The lion is free!
"Thank you, little mouse," says the lion.
Now they are friends.`,
  },
  {
    id: 'w-billy-goats',
    title: 'Three Billy Goats Gruff',
    kind: 'story',
    level: 2,
    description: 'Three goats want to cross a bridge. A troll lives under it.',
    credit: RETOLD,
    hints: { troll: 'monster', 'trip, trap': 'walk' },
    text: `Three goats want to eat the green grass.
The grass is over the bridge.

A troll lives under the bridge.

The little goat walks on the bridge. Trip, trap!
"Who is on my bridge?" says the troll.
"Don't eat me. My big brother is coming."

The middle goat walks on the bridge. Trip, trap!
"Who is on my bridge?" says the troll.
"Don't eat me. My big brother is coming."

The big goat walks on the bridge. TRIP, TRAP!
"Who is on my bridge?" says the troll.
"Me!" says the big goat.

The big goat pushes the troll into the river.
The troll goes away.

The three goats eat the green grass.
They are happy.`,
  },

  // ---------- nursery rhymes (traditional, public domain) ----------
  {
    id: 'w-twinkle',
    title: 'Twinkle, Twinkle, Little Star',
    kind: 'rhyme',
    level: 1,
    description: 'The bedtime song.',
    credit: 'Traditional rhyme (public domain).',
    hints: { twinkle: 'star' },
    text: `Twinkle, twinkle, little star,
How I wonder what you are!

Up above the world so high,
Like a diamond in the sky.

Twinkle, twinkle, little star,
How I wonder what you are!`,
  },
  {
    id: 'w-humpty',
    title: 'Humpty Dumpty',
    kind: 'rhyme',
    level: 1,
    description: 'Humpty Dumpty sat on a wall.',
    credit: 'Traditional rhyme (public domain).',
    hints: { 'humpty dumpty': 'egg', humpty: 'egg', "king's": 'man' },
    text: `Humpty Dumpty sat on a wall.

Humpty Dumpty had a great fall.

All the king's horses and all the king's men

Couldn't put Humpty together again.`,
  },
  {
    id: 'w-row-boat',
    title: 'Row, Row, Row Your Boat',
    kind: 'rhyme',
    level: 1,
    description: 'Sing and row along.',
    credit: 'Traditional song (public domain).',
    text: `Row, row, row your boat,
Gently down the stream.

Merrily, merrily, merrily, merrily,
Life is but a dream.`,
  },
  {
    id: 'w-itsy-spider',
    title: 'The Itsy Bitsy Spider',
    kind: 'rhyme',
    level: 1,
    description: 'Up the water spout.',
    credit: 'Traditional song (public domain).',
    hints: { 'itsy bitsy': 'little' },
    text: `The itsy bitsy spider climbed up the water spout.

Down came the rain and washed the spider out.

Out came the sun and dried up all the rain.

And the itsy bitsy spider climbed up the spout again.`,
  },
  {
    id: 'w-old-macdonald',
    title: 'Old MacDonald Had a Farm',
    kind: 'rhyme',
    level: 1,
    description: 'Farm animals and their sounds.',
    credit: 'Traditional song (public domain).',
    hints: { 'old macdonald': 'farmer', 'e-i-e-i-o': '-', moo: 'cow', oink: 'pig', quack: 'duck' },
    text: `Old MacDonald had a farm. E-I-E-I-O!

And on his farm he had a cow. E-I-E-I-O!
With a moo moo here and a moo moo there.

And on his farm he had a pig. E-I-E-I-O!
With an oink oink here and an oink oink there.

And on his farm he had a duck. E-I-E-I-O!
With a quack quack here and a quack quack there.

Old MacDonald had a farm. E-I-E-I-O!`,
  },
  {
    id: 'w-baa-baa',
    title: 'Baa, Baa, Black Sheep',
    kind: 'rhyme',
    level: 1,
    description: 'Have you any wool?',
    credit: 'Traditional rhyme (public domain).',
    hints: { baa: 'sheep', sir: 'man', master: 'man', dame: 'lady' },
    text: `Baa, baa, black sheep, have you any wool?

Yes sir, yes sir, three bags full.

One for the master, one for the dame,

And one for the little boy who lives down the lane.`,
  },

  // ---------- social stories ----------
  {
    id: 's-going-to-school',
    title: 'Going to School',
    kind: 'social',
    level: 2,
    description: 'What happens on a school day.',
    credit: 'Social story written for Picture Word Books.',
    text: `In the morning, I get dressed for school.

I eat my breakfast.

I put on my shoes and my coat.
I take my bag.

I go to school.

At school I see my teacher.
I can say "hello."

I hang up my coat and my bag.

I sit with my class.
My teacher helps me learn.

At the end of the day, I go home.
I did a good job today!`,
  },
  {
    id: 's-brushing-teeth',
    title: 'I Brush My Teeth',
    kind: 'social',
    level: 1,
    description: 'Step by step, morning and night.',
    credit: 'Social story written for Picture Word Books.',
    text: `I brush my teeth in the morning and at night.

I get my toothbrush.

I put on a little toothpaste.

I brush my top teeth.

I brush my bottom teeth.

I spit in the sink.

I wash my toothbrush with water.

My teeth are clean!`,
  },
  {
    id: 's-haircut',
    title: 'Getting a Haircut',
    kind: 'social',
    level: 2,
    description: 'What to expect at the hairdresser.',
    credit: 'Social story written for Picture Word Books.',
    text: `Sometimes my hair gets long.
Then I go for a haircut.

I sit in a big chair.

The hairdresser puts a cape on me.
The cape keeps hair off my clothes.

The hairdresser may spray water on my hair.
It feels cold and wet. That is OK.

The scissors make a snip, snip sound.
The clippers make a buzz sound.
I can sit still.

If I need a break, I can say "stop, please."

When it is finished, my hair is short and neat.
I did it!`,
  },
  {
    id: 's-waiting-turn',
    title: 'Waiting for My Turn',
    kind: 'social',
    level: 2,
    description: 'Taking turns with friends.',
    credit: 'Social story written for Picture Word Books.',
    text: `Sometimes I want to play with a toy.
My friend is playing with it.

I can wait for my turn.

While I wait, I can count to ten.
Or I can play with something else.

When my friend is finished, it is my turn.

When I am finished, I give it to my friend.
Now it is their turn.

Taking turns is fair.
My friends like to play with me.`,
  },
  {
    id: 's-doctor',
    title: 'Going to the Doctor',
    kind: 'social',
    level: 2,
    description: 'A check-up, step by step.',
    credit: 'Social story written for Picture Word Books.',
    text: `Sometimes I go to see the doctor.
The doctor helps me stay healthy.

First, I sit in the waiting room.
I can read a book while I wait.

A nurse calls my name.
I go into a small room with my mom or dad.

The nurse may check how tall I am.
She may check how much I weigh.

The doctor listens to my heart.
It does not hurt.

The doctor looks in my ears and my mouth.
I can say "ah."

When the doctor is finished, I go home.
I was brave!`,
  },
  {
    id: 's-feelings',
    title: 'When I Feel Angry',
    kind: 'social',
    level: 2,
    description: 'Calm ways to feel better.',
    credit: 'Social story written for Picture Word Books.',
    text: `Sometimes I feel angry.
Everyone feels angry sometimes. That is OK.

When I feel angry, my face may feel hot.
My hands may want to hit.

I can stop.

I can take a big breath in and blow it out.
I can count to ten.

I can squeeze my hands.
I can ask for a hug.

I can tell a grown-up, "I feel angry."

Soon I feel calm again.`,
  },
  {
    id: 's-washing-hands',
    title: 'I Wash My Hands',
    kind: 'social',
    level: 1,
    description: 'Clean hands, step by step.',
    credit: 'Social story written for Picture Word Books.',
    text: `I wash my hands before I eat and after the toilet.

I turn on the water.

I put soap on my hands.

I rub my hands together.

I wash off the soap with water.

I turn off the water.

I dry my hands on a towel.

My hands are clean!`,
  },
  {
    id: 's-bedtime',
    title: 'Bedtime',
    kind: 'social',
    level: 1,
    description: 'Getting ready for bed.',
    credit: 'Social story written for Picture Word Books.',
    text: `When it is dark, it is time for bed.

I take a bath.

I put on my pajamas.

I brush my teeth.

I read a book with my mom or dad.

I get into bed.
The light goes off.

I close my eyes and go to sleep.
Good night!`,
  },
];
