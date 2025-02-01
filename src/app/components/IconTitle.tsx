import Image from 'next/image';

const IconTitle = () => (
  <div className="text-center mb-6">
    <div className="flex items-center justify-center gap-2 mb-2">
      <div className="flex items-center justify-center">
        <Image 
          src="/images/owner-note-icon.png" 
          alt="Owner Note" 
          width={80}
          height={80}
          className="opacity-75 hover:opacity-100 transition-opacity dark:invert"
          draggable={false}
        />
      </div>
    </div>
    <h1 className="text-2xl font-bold dark:text-white">
      Owner Note
    </h1>
  </div>
);

export default IconTitle;